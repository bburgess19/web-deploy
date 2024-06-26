import { getInput, setFailed } from "@actions/core";
import { exec, ExecOptions } from "@actions/exec";
import { IActionArguments } from "./types";
import commandExistsSync from "command-exists";
import stringArgv from "string-argv";
import { existsSync, promises } from "fs";
import { join } from "path";

// note: when updating also update README.md, action.yml
const default_rsync_options =
  "--archive --verbose --compress --human-readable --progress --delete-after --exclude=.git* --exclude=.git/ --exclude=README.md --exclude=readme.md --exclude=.gitignore";
const errorDeploying = "⚠️ Error deploying";

async function run() {
  try {
    const userArguments = getUserArguments();

    console.log(
      `----------------------------------------------------------------`,
    );
    console.log(`🚀 Ben Burgess Canary!`);
    console.log(
      `----------------------------------------------------------------`,
    );
    await verifyRsyncInstalled();
    const privateKeyPath = await setupSSHPrivateKey(
      userArguments.private_ssh_key,
    );
    await syncFiles(privateKeyPath, userArguments);

    console.log("✅ Deploy Complete");
  } catch (error) {
    console.error(errorDeploying);
    setFailed(error as any);
  }
}

run();

function getUserArguments(): IActionArguments {
  return {
    target_server: getInput("target-server", { required: true }),
    destination_path: withDefault(
      getInput("destination-path", { required: false }),
      "./",
    ),
    remote_user: getInput("remote-user", { required: true }),
    private_ssh_key: getInput("private-ssh-key", { required: true }),
    source_path: withDefault(
      getInput("source-path", { required: false }),
      "./",
    ),
    ssh_port: withDefault(getInput("ssh-port"), "22"),
    rsync_options: withDefault(
      getInput("rsync-options"),
      default_rsync_options,
    ),
  };
}

function withDefault(value: string, defaultValue: string) {
  if (value === "" || value === null || value === undefined) {
    return defaultValue;
  }

  return value;
}

/**
 * Sync changed files
 */
export async function syncFiles(
  privateKeyPath: string,
  args: IActionArguments,
) {
  try {
    const rsyncArguments: string[] = [];

    rsyncArguments.push("-e");

    rsyncArguments.push(
      `ssh -vvv -p ${args.ssh_port} -i ${privateKeyPath} -o StrictHostKeyChecking=no`,
    );
    console.log("rsyncArguments", rsyncArguments);

    // rsyncArguments.push(...stringArgv(args.rsync_options));
    rsyncArguments.push(...stringArgv("-v"));
    console.log("rsyncArguments", rsyncArguments);

    if (args.source_path !== undefined) {
      rsyncArguments.push(args.source_path);
    }
    console.log("rsyncArguments", rsyncArguments);

    const destination = `${args.remote_user}@${args.target_server}:./`;
    rsyncArguments.push(destination);
    console.log("rsyncArguments", rsyncArguments);

    // return await exec(
    //   "ssh",
    //   [
    //     "-o",
    //     "StrictHostKeyChecking=no",
    //     "-i",
    //     privateKeyPath,
    //     "-p",
    //     args.ssh_port,
    //     args.remote_user + "@" + args.target_server,
    //   ],
    //   mapOutput,
    // );
    return await exec("rsync", rsyncArguments, mapOutput);
  } catch (error) {
    setFailed(error as any);
  }
}

async function verifyRsyncInstalled() {
  try {
    await commandExistsSync("rsync");

    // command exists, continue
    return;
  } catch (commandExistsError) {
    throw new Error(
      "rsync not installed. For instructions on how to fix see https://github.com/SamKirkland/web-deploy#rsync-not-installed",
    );
  }
}

const { HOME, GITHUB_WORKSPACE } = process.env;

export async function setupSSHPrivateKey(key: string) {
  const sshFolderPath = join(HOME || __dirname, ".ssh");
  const privateKeyPath = join(sshFolderPath, "web_deploy_key");

  console.log("HOME", HOME);
  console.log("GITHUB_WORKSPACE", GITHUB_WORKSPACE);

  await promises.mkdir(sshFolderPath, { recursive: true });

  const knownHostsPath = `${sshFolderPath}/known_hosts`;

  if (!existsSync(knownHostsPath)) {
    console.log(`[SSH] Creating ${knownHostsPath} file in `, GITHUB_WORKSPACE);
    await promises.writeFile(knownHostsPath, "", {
      encoding: "utf8",
      mode: 0o600,
    });
    console.log("✅ [SSH] file created.");
  } else {
    console.log(`[SSH] ${knownHostsPath} file exist`);
  }

  await promises.writeFile(privateKeyPath, key, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log("✅ Ssh key added to `.ssh` dir ", privateKeyPath);

  return privateKeyPath;
}

export const mapOutput: ExecOptions = {
  listeners: {
    stdout: (data: Buffer) => {
      console.log(data);
    },
    stderr: (data: Buffer) => {
      console.error(data);
    },
  },
};
