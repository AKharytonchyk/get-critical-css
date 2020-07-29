const puppeteer = require('puppeteer');
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');
let browser, page;

const outputFormat = {
  CONSOLE:'console',
  FILE:'file',
}

const args = yargs
  .usage('get-critical-css --url [page-url] --output [file|console]')
  .alias('u', 'url')
  .alias('o', 'output')
  .alias('w', 'width')
  .alias('h', 'height')
  .describe(['u', 'url'], 'Page url where you want to get critical css from')
  .describe(['o', 'output'], 'Output format. File or Console only.')
  .describe(['w', 'width'], 'Define viewport width')
  .describe(['h', 'height'], 'Define viewport height')
  .choices('output', [outputFormat.CONSOLE, outputFormat.FILE])
  .demandOption(['url', 'output']).argv;



function getFileName(props) {
  const { url, width, height } = props;
  console.log(props);
  let fileName = url
    .replace(/http?(s):\/\//i, '')
    .replace(/\?.+/, '')
    .replace(/\//g, '.');
  
  if (width && height) fileName = ''.concat(fileName, '.', width, 'x', height);

  return fileName.concat('.css').replace(/\.\./g, '.');
};

const runCoverage = async () => {
  browser = await puppeteer.launch();
  page = await browser.newPage();

  if(args.width && args.height) page.setViewport({ width: args.width, height: args.height });

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

  const rules = await client.send('CSS.takeCoverageDelta');
  const usedRules = rules.coverage.filter((rule) => rule.used);

  // Consolidate used styles that are not yet inlined.
  const slices = [];
  for (const usedRule of usedRules) {
    if (inlineStylesheetIndex.has(usedRule.styleSheetId)) {
      continue;
    }

    const stylesheet = await client.send('CSS.getStyleSheetText', {
      styleSheetId: usedRule.styleSheetId,
    });

    slices.push(stylesheet.text.slice(usedRule.startOffset, usedRule.endOffset));
  }

  switch (args.output) {
    case outputFormat.CONSOLE:
      console.log(slices.join(''));
      break;
    case outputFormat.FILE:
      const filename = getFileName(args);
      const filePath = path.join(__dirname, '../dist', filename);
      fs.writeFileSync(filePath, slices.join(''), { encoding: 'utf-8'});
      break;
    default:
      break;
  }

  await page.close();
  await browser.close();
};

runCoverage().catch(e => {
  page && page.close();
  browser && browser.close();

  throw e;
})
