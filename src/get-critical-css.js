const puppeteer = require('puppeteer');
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
const process = require('process');

const outputFormat = {
  CONSOLE:'console',
  FILE:'file',
}

const args = yargs
  .usage('get-critical-css --url \x1b[36m{{url}}\x1b[0m --output \x1b[36m{{type}}\x1b[0m')
  .usage('get-critical-css --url \x1b[36m{{url}}\x1b[0m --output \x1b[36m{{type}}\x1b[0m --width \x1b[36m[700,1100,1920]\x1b[0m')
  .alias('u', 'url')
  .alias('o', 'output')
  .alias('w', 'width')
  .describe(['u', 'url'], 'Page url where you want to get critical css from')
  .describe(['o', 'output'], 'Output format. `\x1b[36mfile\x1b[0m` or `\x1b[36mconsole\x1b[0m` only.')
  .describe(['w', 'width'], 'Define viewport width. Provide an array without spaces.')
  .choices('output', [outputFormat.CONSOLE, outputFormat.FILE])
  .demandOption(['url', 'output']).argv;

function getFileName(props) {
  const { url } = props;
  const fileName = url.replace(/https?:\/\/|\/$/ig,'').replace(/:|\//gi, '_');
  
  console.log(fileName.concat('.css'));
  return fileName.concat('.css');
};


const runCoverage = async (page) => {
  // Start sending raw DevTools Protocol commands are sent using `client.send()`
  // First off enable the necessary "Domains" for the DevTools commands we care about
  const client = await page.target().createCDPSession();
  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('CSS.enable');

  // Filter Inline styles
  const inlineStylesheetIndex = new Set();
  client.on('CSS.styleSheetAdded', (stylesheet) => {
    const { header } = stylesheet;
    if (header.isInline || header.sourceURL === '' || header.sourceURL.startsWith('blob:')) {
      inlineStylesheetIndex.add(header.styleSheetId);
    }
  });

  // Start tracking CSS coverage
  await client.send('CSS.startRuleUsageTracking');

  await page.goto(args.url);

  if (args.width) {
    const viewportWidth = JSON.parse(args.width);
    viewportWidth.forEach(width => {
      page.setViewport({ width, height: 1080 });
    });
  }

  const rules = await client.send('CSS.takeCoverageDelta');
  const usedRules = rules.coverage.filter((rule) => rule.used && !inlineStylesheetIndex.has(rule.styleSheetId));
  // Consolidate used styles that are not yet inlined.
  const critical = [];

  await Promise.all(
    usedRules.map(async (usedRule) => {
      const stylesheet = await client.send('CSS.getStyleSheetText', {
        styleSheetId: usedRule.styleSheetId,
      });

      critical.push(stylesheet.text.slice(usedRule.startOffset, usedRule.endOffset));
    }),
  );

  console.log('\n==== Critical Styles ====\n')
  console.log('Viewport: ', args.width || 'default');
  console.log('Style count:', critical.length);
  console.log('\n=========================\n')

  switch (args.output) {
    case outputFormat.CONSOLE:
      console.log(critical.join(''));
      break;
    case outputFormat.FILE:
      fs.writeFileSync(path.join(__dirname, '../dist', getFileName(args)), critical.join(''), { encoding: 'utf-8' });
      break;
    default:
      break;
  }
};

const run = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
    await runCoverage(page);
  } finally {
    await page.close();
    await browser.close();
  }
}

run().catch(e => {
  console.error('\x1b[31m','Something when wrong!','\x1b[0m')
  console.error(e)
  process.exit(1);
});
