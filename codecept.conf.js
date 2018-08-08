module.exports.config = {
  tests: "./e2e/tests/**/*.test.js",
  timeout: 10000,
  output: "./e2e/ouput",
  helpers: {
    Puppeteer: {
      url: "http://localhost:5000",
      waitForNavigation: "networkidle0",
      show: false
    }
  },
  include: {
    I: "./e2e/steps_file.js"
  },
  bootstrap: false,
  mocha: {},
  name: "clj-slack-signup"
};
