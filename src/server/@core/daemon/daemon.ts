import * as ChildProcess from 'child_process';
import * as Path from 'path';

import {BoringCache} from 'boring-cache';
import * as FSE from 'fs-extra';
import getPort from 'get-port';
import _ from 'lodash';
import uuid from 'uuid';
import * as v from 'villa';

import {
  CreateWorkspaceOptions,
  RawWorkspaceProject,
  RawWorkspaceProjectGit,
  RawWorkspaceProjectInPlaceConfig,
  WorkspaceMetadata,
  WorkspaceStatus,
  WorkspaceStatusWithPullMergeRequestInfo,
} from '../../../../bld/shared';
import {gracefulReadJSONFile} from '../../../node-shared';
import {parseGitURL} from '../../@utils';
import {Config} from '../config';
import {Workspace} from '../workspace';

import {
  generateCreatePullMergeRequestInfo,
  listPullMergeRequests,
} from './@git-services';
import {WorkspaceFiles} from './@workspace-files';

export function PROJECT_CONFIG_PATH(
  config: Config,
  workspace: WorkspaceMetadata,
  project: RawWorkspaceProject,
): string {
  return Path.join(
    config.dir,
    'workspaces',
    workspace.id,
    project.name,
    'remote-workspace.json',
  );
}

export interface DaemonStorageData {
  workspaces?: WorkspaceMetadata[];
}

export class Daemon {
  readonly workspaceFiles = new WorkspaceFiles(this.config);

  private dockerComposeUpPromise = Promise.resolve();

  constructor(
    private config: Config,
    private storage: BoringCache<DaemonStorageData>,
  ) {
    this.update().catch(console.error);
  }

  private get workspaces(): Workspace[] {
    return this.storage
      .list('workspaces')
      .map(({port, ...raw}) => new Workspace(raw, port, this.config));
  }

  async isWorkspaceReady(id: string): Promise<boolean> {
    return FSE.stat(
      Path.join(this.config.dir, 'workspaces', id, '.ready'),
    ).then(
      () => true,
      () => false,
    );
  }

  async getWorkspaceStatuses(): Promise<
    WorkspaceStatusWithPullMergeRequestInfo[]
  > {
    let gitHostToServiceConfigMap = this.config.gitHostToServiceConfigMap;

    let workspaces = await v.map(
      this.storage.list('workspaces'),
      async (metadata): Promise<WorkspaceStatus> => {
        return {
          ...metadata,
          projects: await v.map(
            metadata.projects,
            async (project): Promise<RawWorkspaceProject> => {
              return {
                ...project,
                ...(await this.getInPlaceProjectConfig(metadata, project)),
              };
            },
          ),
          ready: await this.isWorkspaceReady(metadata.id),
        };
      },
    );

    let projectInfos = _.compact(
      _.uniqWith(
        _.compact(
          _.flattenDeep(
            workspaces.map(workspace =>
              workspace.projects.map(({git: {url}}) => parseGitURL(url)),
            ),
          ),
        ),
        _.isEqual,
      ).map(info => {
        let service = gitHostToServiceConfigMap.get(info.host);

        return (
          service && {
            ...info,
            service,
          }
        );
      }),
    );

    let pullMergeRequestInfos = await listPullMergeRequests(projectInfos);

    return workspaces.map(workspace => {
      return {
        ...workspace,
        projects: workspace.projects.map(project => {
          let {
            url,
            branch: targetBranch = 'master',
            newBranch: sourceBranch = targetBranch,
          }: RawWorkspaceProjectGit = project.git;

          let urlInfo = parseGitURL(url);

          if (!urlInfo || targetBranch === sourceBranch) {
            return project;
          }

          let {host, project: projectPath} = urlInfo;

          let pullMergeRequestInfo = pullMergeRequestInfos.find(
            info =>
              info.host === host &&
              info.project === projectPath &&
              info.targetBranch === targetBranch &&
              info.sourceBranch === sourceBranch,
          );

          if (pullMergeRequestInfo) {
            let {id, url, state} = pullMergeRequestInfo;

            return {
              ...project,
              git: {
                ...project.git,
                pullMergeRequest: {
                  text: `#${id}`,
                  url,
                  state,
                },
              },
            };
          }

          let serviceConfig = gitHostToServiceConfigMap.get(host);

          let createPullMergeRequestInfo =
            serviceConfig &&
            generateCreatePullMergeRequestInfo(
              host,
              projectPath,
              sourceBranch,
              targetBranch,
              serviceConfig,
            );

          return {
            ...project,
            git: {
              ...project.git,
              pullMergeRequest: createPullMergeRequestInfo,
            },
          };
        }),
      };
    });
  }

  async createWorkspace(options: CreateWorkspaceOptions): Promise<string> {
    let id = uuid();

    let workspacePortSet = new Set(
      this.workspaces.map(workspace => workspace.port),
    );

    let port: number;

    // tslint:disable-next-line: no-conditional-assignment
    while ((port = await getPort())) {
      if (!workspacePortSet.has(port)) {
        break;
      }
    }

    this.storage.push('workspaces', {
      id,
      port,
      ...options,
    });

    await this.update();

    return id;
  }

  async updateWorkspace(workspace: WorkspaceMetadata): Promise<void> {
    this.storage.pull('workspaces', ({id}) => id === workspace.id);

    this.storage.push('workspaces', workspace);

    await this.update();
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.storage.pull('workspaces', metadata => metadata.id === id);

    await this.update();
  }

  async retrieveWorkspaceLog(id: string): Promise<string> {
    let logProcess = ChildProcess.spawn('docker', [
      'logs',
      '--timestamps',
      `${this.config.name}_${id}_1`,
    ]);

    let log = '';

    logProcess.stdout.on('data', data => {
      log += data;
    });

    logProcess.stderr.on('data', data => {
      log += data;
    });

    await v.awaitable(logProcess);

    return log
      .split('\n')
      .sort()
      .join('\n');
  }

  private async getInPlaceProjectConfig(
    workspace: WorkspaceMetadata,
    project: RawWorkspaceProject,
  ): Promise<RawWorkspaceProjectInPlaceConfig | undefined> {
    let configFilePath = PROJECT_CONFIG_PATH(this.config, workspace, project);

    return gracefulReadJSONFile<RawWorkspaceProjectInPlaceConfig>(
      configFilePath,
    );
  }

  private async update(): Promise<void> {
    let workspaces = this.workspaces;

    return (this.dockerComposeUpPromise = this.dockerComposeUpPromise
      .then(async () => {
        console.info('Updating workspace files...');

        await this.workspaceFiles.update(workspaces);

        await this.dockerComposeUp();

        await this.workspaceFiles.prune(workspaces);

        console.info('Done.');
      })
      .catch(console.error));
  }

  private async dockerComposeUp(): Promise<void> {
    let config = this.config;

    console.info('Updating containers...');

    let composeProcess = ChildProcess.spawn(
      'docker-compose',
      ['--project-name', config.name, 'up', '--detach', '--remove-orphans'],
      {
        cwd: config.dir,
      },
    );

    composeProcess.stdout.pipe(process.stdout);
    composeProcess.stderr.pipe(process.stderr);

    await v.awaitable(composeProcess);
  }
}
