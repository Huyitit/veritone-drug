UPDATE
    job_new.viewer_build
SET
    access_url = 'https://viewers.@@{EXTERNAL_DNS_ZONE}@@/json',
    source_url = 'https://viewers.@@{EXTERNAL_DNS_ZONE}@@/json'
WHERE
    viewer_build_id = '01a2ad40-df0d-4fad-bfe8-fbcc10b88beb';