import * as vscode from 'vscode';
import rpath from './remotePath';
import * as output from '../modules/output';
import RemoteFileSystem from '../model/Fs/RemoteFileSystem';
import SFTPFileSystem from '../model/Fs/SFTPFileSystem';
import FTPFileSystem from '../model/Fs/FTPFileSystem';
import RemoteClient from '../model/Client/RemoteClient';
import SFTPClient from '../model/Client/SFTPClient';
import FTPClient from '../model/Client/FTPClient';

function hashOption(opiton) {
  return Object.keys(opiton).map(key => opiton[key]).join('');
}

class KeepAliveRemoteFs {
  private isValid: boolean = false;

  private pendingPromise: Promise<RemoteFileSystem>;

  private fs: RemoteFileSystem;

  private option: any;

  getFs(option): Promise<RemoteFileSystem> {
    if (this.isValid && this.option === option) {
      this.pendingPromise = null;
      return Promise.resolve(this.fs);
    }

    if (!this.pendingPromise) {
      output.debug('conncet to remote');
      if (option.protocol === 'sftp') {
        this.fs = new SFTPFileSystem(rpath, option);
      } else if (option.protocol === 'ftp') {
        this.fs = new FTPFileSystem(rpath, option);
      } else {
        return Promise.reject(new Error(`unsupported protocol ${option.protocol}`));
      }
      const client = this.fs.getClient();
      client.onDisconnected(this.invalid.bind(this));
      output.status.msg('connecting...');
      this.pendingPromise = client.connect(prompt => {
        // tslint:disable-next-line prefer-const
        let password = true;
        // if (/password/i.test(prompt)) {
        //   password = true;
        // }

        return vscode.window.showInputBox({
          ignoreFocusOut: true,
          password,
          prompt,
        }) as Promise<string | null>;
      })
      .then(() => {
        this.isValid = true;
        return this.fs;
      }, err => {
        this.invalid();
        throw err;
      });
    }
    return this.pendingPromise;
  }

  invalid() {
    this.pendingPromise = null;
    this.isValid = false;
  }

  end() {
    this.invalid();
    this.fs.getClient().end();
  }
}

const fsTable: {
  [x: string]: KeepAliveRemoteFs,
} = {};

export default function getRemoteFs(option): Promise<RemoteFileSystem> {
  const identity = hashOption(option);
  const fs = fsTable[identity];
  if (fs !== undefined) {
    return fs.getFs(option);
  }

  const fsInstance = new KeepAliveRemoteFs();
  fsTable[identity] = fsInstance;
  return fsInstance.getFs(option);
}

// TODO
export function endAllRemote() {
  Object.keys(fsTable).forEach(key => {
    const fs = fsTable[key];
    fs.end();
  });
}
