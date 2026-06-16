const API_KEY_HEADER = 'x-api-key';

const authentication = {
  type: 'api-key',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'string',
      required: true,
      helpText: 'Get your API key from https://localpdf.online/settings/api',
    },
  ],
  test: {
    url: 'https://localpdf.online/api/keys/validate',
    method: 'GET',
    headers: {
      [API_KEY_HEADER]: '{{bundle.authData.api_key}}',
    },
  },
  connectionLabel: (z: any, bundle: any) => {
    return `LocalPDF API Key: ${bundle.authData.api_key.slice(0, 12)}...`;
  },
};

module.exports = authentication;
