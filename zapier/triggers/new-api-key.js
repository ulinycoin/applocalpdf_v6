const perform = async (z: any, bundle: any) => {
  return [
    {
      id: 'test_1',
      name: 'Test PDF',
      status: 'ready',
    },
  ];
};

const TestTrigger = {
  key: 'new_api_key',
  noun: 'API Key',
  display: {
    label: 'New API Key',
    description: 'Triggers when a new API key is created.',
  },
  operation: {
    perform,
    sample: {
      id: 'test_1',
      name: 'Test PDF',
      status: 'ready',
    },
  },
};

module.exports = TestTrigger;
