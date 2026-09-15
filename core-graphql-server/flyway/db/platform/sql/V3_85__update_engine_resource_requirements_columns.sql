UPDATE job_new.engine SET cpu_shares = 512
  WHERE engine_id IN (
      '8eccf9cc-6b6d-4d7d-8cb3-7ebf4950c5f3',
      '352556c7-de07-4d55-b33f-74b1cf237f25',
      '8bdb0e3b-ff28-4f6e-a3ba-887bd06e6440',
      'c0e55cde-340b-44d7-bb42-2e0d65e98255',
      '75fc943b-b5b0-4fe1-bcb6-9a7e1884257a'
    );

UPDATE job_new.engine SET cpu_shares = 2048
  WHERE engine_id IN (
      '74dfd76b-472a-48f0-8395-c7e01dd7f255',
      '9e611ad7-2d3b-48f6-a51b-0a1ba40fe255'
    );
