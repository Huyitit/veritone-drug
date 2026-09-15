INSERT INTO sso_token (
	token_id,
	json
) VALUES (
	'engine-certification:9b33844b21814578af2a95f4bcf0ca4e152e176c12ed49a1967c36ceb8129d54',
	'{
		"token_id": "engine-certification:9b33844b21814578af2a95f4bcf0ca4e152e176c12ed49a1967c36ceb8129d5",
		"rights": [
            "developer:engine:read", 
            "developer.build.read" 
        ],
		"internal": true,
		"tokenLabel": "engine-certification",
		"isRevoked": false
	}'
) on conflict do nothing;