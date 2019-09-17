import * as FS from 'fs';
import * as Path from 'path';

import {AbstractConfig} from '../../../../bld/node-shared';
import {RawTemplatesConfig} from '../../../../bld/shared';

import {RawConfig, RawUserConfig} from './raw-config';

export interface VolumesConfig {
  ssh: string;
}

export class Config extends AbstractConfig<RawConfig> {
  readonly dir: string;

  constructor(path: string) {
    super(path);

    this.dir = Path.dirname(path);
  }

  get dataDir(): string {
    let {dataDir = '.'} = this.raw;
    return Path.resolve(this.dir, dataDir);
  }

  get identity(): string {
    let {identity} = this.raw;
    let path = Path.join(this.dir, identity);

    return FS.readFileSync(path, 'utf-8');
  }

  get users(): RawUserConfig[] {
    return this.raw.users;
  }

  get volumes(): VolumesConfig {
    let {volumes = {}} = this.raw;
    let {ssh = 'remote-dev-ssh'} = volumes;
    return {ssh};
  }

  get templates(): RawTemplatesConfig {
    let {templates = {}} = this.raw;
    return templates;
  }
}
