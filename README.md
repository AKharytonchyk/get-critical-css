# Script to export critical CSS

## Usage

Install node modules `npm i`.

To run get result in console please run `node .\src\get-critical-css.js --url "{{YOUR_URL}}" --output "console"`. You will see your critical CSS in console output.

To get result in file please run `node .\src\get-critical-css.js --url "{{YOUR_URL}}" --output "file"`. You will find a minified CSS file in `dist` folder.

## Websites with media break points

If your side have a responsive layout based on viewport size you can provide expected width as an array:
`node .\src\get-critical-css.js --url "https://my.website.com/foo" --output "file" --width [699, 1199, 1499]`

