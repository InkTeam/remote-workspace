import {Button, Checkbox, Modal, PageHeader, message} from 'antd';
import {CheckboxChangeEvent} from 'antd/lib/checkbox';
import TextArea from 'antd/lib/input/TextArea';
import {RouteComponentProps} from 'boring-router-react';
import {action, computed, observable} from 'mobx';
import {observer} from 'mobx-react';
import React, {ChangeEvent, Component, ReactNode, createRef} from 'react';

import {RawTemplatesConfig, WorkspaceMetadata} from '../../../bld/shared';
import {VersionInfo, WorkspaceForm, WorkspaceList} from '../@components';
import {WorkspaceRoute} from '../@routes';
import {loadCustomizeInitScript, saveCustomizeInitScript} from '../@utils';

export interface HomeViewProps
  extends RouteComponentProps<WorkspaceRoute['home']> {
  className?: string;
}

@observer
export class HomeView extends Component<HomeViewProps> {
  private workspaceListRef = createRef<WorkspaceList>();

  @observable
  private templates: RawTemplatesConfig = {};

  @observable
  private toShowAllWorkspaces = false;

  @observable
  private editingWorkspace: WorkspaceMetadata | undefined;

  @observable
  private formKey = 0;

  @observable
  private toShowCustomizeModal = false;

  @observable
  private customizeInitScriptContent = loadCustomizeInitScript();

  render(): ReactNode {
    let editingWorkspace = this.editingWorkspace;

    return (
      <div>
        <VersionInfo></VersionInfo>
        <PageHeader
          title="Workspaces"
          extra={
            <>
              <Checkbox
                checked={this.toShowAllWorkspaces}
                onChange={this.onShowAllWorkspacesCheckboxChange}
              >
                show workspaces of other owners
              </Checkbox>
            </>
          }
        />
        <div className="section-content">
          <WorkspaceList
            editingWorkspace={editingWorkspace}
            ref={this.workspaceListRef}
            all={this.toShowAllWorkspaces}
            onEditClick={this.onWorkspaceListEditClick}
          />
        </div>
        <PageHeader
          title={editingWorkspace ? 'Edit Workspace' : 'Create Workspace'}
          extra={
            editingWorkspace ? (
              <Button size="small" onClick={this.onCancelEditButtonClick}>
                Cancel
              </Button>
            ) : (
              <Button
                size="small"
                icon="setting"
                onClick={this.onShowCustomizeModal}
              >
                Customize
              </Button>
            )
          }
        />
        <div className="section-content">
          <WorkspaceForm
            key={this.formKey}
            templates={this.templates}
            workspace={editingWorkspace}
            onSubmitSuccess={this.onWorkspaceFormSubmitSuccess}
            customInitScript={this.customizeInitScriptContent}
          />
        </div>
        {this.customizeModalRendering}
      </div>
    );
  }

  @computed
  get customizeModalRendering(): ReactNode {
    return (
      <Modal
        title="Customize create steps"
        visible={this.toShowCustomizeModal}
        onOk={this.onSaveCustomizeSettings}
        onCancel={this.onCloseCustomizeSettings}
      >
        <p>
          Your personal customize script will be saved in browser storage.
          <br /> <strong>Supported syntx: bash</strong>
        </p>
        <TextArea
          rows={20}
          value={this.customizeInitScriptContent}
          onChange={this.onCustomizeInitScriptInputChange}
        ></TextArea>
      </Modal>
    );
  }

  componentDidMount(): void {
    this.loadTemplates().catch(console.error);
  }

  private onWorkspaceListEditClick = (workspace: WorkspaceMetadata): void => {
    this.editingWorkspace = workspace;
    this.formKey++;
  };

  private onCancelEditButtonClick = (): void => {
    this.editingWorkspace = undefined;
    this.formKey++;
  };

  private onWorkspaceFormSubmitSuccess = (): void => {
    this.workspaceListRef.current!.refresh();
    this.editingWorkspace = undefined;
    this.formKey++;
  };

  private onShowAllWorkspacesCheckboxChange = ({
    target,
  }: CheckboxChangeEvent): void => {
    this.toShowAllWorkspaces = target.checked;
  };

  private onShowCustomizeModal = (): void => {
    this.customizeInitScriptContent = loadCustomizeInitScript();
    this.toShowCustomizeModal = true;
  };

  private onSaveCustomizeSettings = (): void => {
    this.toShowCustomizeModal = false;
    saveCustomizeInitScript(this.customizeInitScriptContent);

    message.success('Saved');
  };

  private onCloseCustomizeSettings = (): void => {
    this.toShowCustomizeModal = false;
  };

  @action
  private onCustomizeInitScriptInputChange = (
    e: ChangeEvent<HTMLTextAreaElement>,
  ): void => {
    this.customizeInitScriptContent = e.target.value;
  };

  private async loadTemplates(): Promise<void> {
    let response = await fetch('/api/templates');
    let {data} = (await response.json()) as {
      data?: RawTemplatesConfig;
    };

    if (data) {
      this.templates = data;
    }
  }
}
