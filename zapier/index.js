const { version } = require('../package.json');

const authentication = require('./authentication');
const ProcessPdf = require('./creates/process-pdf');

module.exports = {
  version,
  platformVersion: require('zapier-platform-core').version,

  authentication,

  triggers: {},

  searches: {},

  creates: {
    [ProcessPdf.key]: ProcessPdf,
  },

  resources: {},

  beforeRequest: [],
  afterResponse: [],
};
