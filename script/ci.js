const { fork, execSync } = require('child_process');
const path = require('path');
const compressing = require('compressing');
const fs = require('fs');
const pump = require('pump');
const releaseDir = path.join(__dirname, '../release');
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir);
}

function build({ targetBrowser }) {
  const buildScript = require.resolve('./build');
  const buildEnv = Object.create(process.env);
  buildEnv.NODE_ENV = 'production';
  buildEnv.TARGET_BROWSER = targetBrowser;
  buildEnv.FF_RELEASE = process.env.FF_RELEASE;
  const cp = fork(buildScript, [], {
    env: buildEnv,
    silent: true,
  });
  return new Promise(r => {
    cp.on('message', r);
  });
}

function pack({ targetBrowser, beta }) {
  const dist = path.resolve(__dirname, `../dist`);
  const zipStream = new compressing.zip.Stream();
  fs.readdirSync(dist).forEach(o => {
    if (o.match(/^\./)) {
      return;
    }
    zipStream.addEntry(path.join(dist, o));
  });
  const dest = path.join(
    releaseDir,
    `web_clipper_${targetBrowser.toLocaleLowerCase()}${beta ? '_canary' : ''}.zip`
  );
  const destStream = fs.createWriteStream(dest);
  return new Promise(r => {
    pump(zipStream, destStream, r);
  });
}

(async () => {
  const beta = process.env.BETA === 'true';
  const ffRelease = process.env.FF_RELEASE === 'true';
  console.log('beta:', beta, 'ffRelease:', ffRelease);
  const browserList = ['Firefox', 'Chrome'];
  if (ffRelease) {
    browserList.pop();
  }
  for (const browser of browserList) {
    console.log(`Start Build ${browser} Version`);
    await build({ targetBrowser: browser });
    if (beta) {
      const dist = path.resolve(__dirname, `../dist`);
      const manifest = path.resolve(dist, 'manifest.json');
      const manifestJSON = JSON.parse(fs.readFileSync(manifest, { encoding: 'utf8' }));
      manifestJSON.name = `${manifestJSON.name} Beta`;
      const branch = process.env.GITHUB_BRANCH || 'refs/heads/master';
      const masterCommitsCount = execSync(`git rev-list --count ${branch}`)
        .toString()
        .trim();
      manifestJSON.version = manifestJSON.version.replace(/.[0-9]$/, `.${masterCommitsCount}`);
      console.log(`Current Version ${manifestJSON.version}`);
      fs.writeFileSync(manifest, JSON.stringify(manifestJSON));
    }
    console.log(`Build ${browser} Version Success`);
    await pack({ targetBrowser: browser, beta });
  }
})();
