-- citests/scheduledJob.js

INSERT INTO job_new.build (
    engine_id,
    build_id,
    version,
    build_state,
    created_date,
    updated_date,
    deployment_model,
    docker_image,
    task_runtime,
    is_legacy,
    manifest
)
SELECT
    '270beec6-185b-4fd9-87f9-9699ff2af596',
    'b3fed59d-fb01-40f6-9aa1-3f2867a23ab0',
    3,
    'deployed',
    1575100214,
    1575100214,
    0,
    '026972849384.dkr.ecr.us-east-1.amazonaws.com/node-red-runner:latest',
    '{
        "edge": {},
        "nodeRed": {
            "flows": [
            {
                "id": "232d4eac.aef9c2",
                "in": [
                {
                    "x": 175.99998092651367,
                    "y": 119.0000057220459,
                    "wires": []
                }
                ],
                "out": [],
                "info": "",
                "name": "VTN-27344: proccess clips and send email",
                "type": "subflow",
                "category": ""
            },
            {
                "id": "b089ae99.235e",
                "in": [
                {
                    "x": 114.5,
                    "y": 226,
                    "wires": [
                    {
                        "id": "d2d49ad3.9f0fe8"
                    }
                    ]
                }
                ],
                "out": [
                {
                    "x": 1058.5,
                    "y": 324,
                    "wires": [
                    {
                        "id": "71341ca.92552e4",
                        "port": 0
                    }
                    ]
                }
                ],
                "info": "",
                "name": "Subflow 2",
                "type": "subflow",
                "category": ""
            },
            {
                "id": "df031bce.f63348",
                "in": [
                {
                    "x": 235,
                    "y": 884,
                    "wires": [
                    {
                        "id": "769bc735.746c68"
                    }
                    ]
                }
                ],
                "out": [
                {
                    "x": 919.5,
                    "y": 1393,
                    "wires": [
                    {
                        "id": "4561dffc.8deeb",
                        "port": 0
                    }
                    ]
                }
                ],
                "info": "",
                "name": "batch apply tags on TDOs and insert-into-index",
                "type": "subflow",
                "category": ""
            },
            {
                "id": "4e4df670.895218",
                "in": [
                {
                    "x": 539.250018119812,
                    "y": 318.25000953674316,
                    "wires": [
                    {
                        "id": "bcea8a33.9fb488"
                    }
                    ]
                }
                ],
                "out": [
                {
                    "x": 1190.7500457763672,
                    "y": 460.0000171661377,
                    "wires": [
                    {
                        "id": "6fc18001.19252",
                        "port": 0
                    }
                    ]
                }
                ],
                "info": "",
                "name": "searchQuery to tdoData: search then scroll",
                "type": "subflow",
                "category": ""
            },
            {
                "id": "a8e76fb0.fc608",
                "in": [
                {
                    "x": 200,
                    "y": 219,
                    "wires": [
                    {
                        "id": "22c759b.79ed2a6"
                    }
                    ]
                }
                ],
                "out": [
                {
                    "x": 454,
                    "y": 174,
                    "wires": [
                    {
                        "id": "22c759b.79ed2a6",
                        "port": 0
                    }
                    ]
                },
                {
                    "x": 455,
                    "y": 259,
                    "wires": [
                    {
                        "id": "22c759b.79ed2a6",
                        "port": 1
                    }
                    ]
                }
                ],
                "name": "Iterate",
                "type": "subflow"
            },
            {
                "id": "3d395a22.2c5d36",
                "in": [
                {
                    "x": 53,
                    "y": 27,
                    "wires": [
                    {
                        "id": "95cedfd7.08e2c"
                    }
                    ]
                }
                ],
                "out": [
                {
                    "x": 991.5,
                    "y": 126,
                    "wires": [
                    {
                        "id": "19fdf6b6.3d5569",
                        "port": 0
                    }
                    ]
                },
                {
                    "x": 961.5,
                    "y": 570,
                    "wires": [
                    {
                        "id": "6c052997.4f0ee8",
                        "port": 1
                    },
                    {
                        "id": "90411c08.90ecf",
                        "port": 1
                    },
                    {
                        "id": "19fdf6b6.3d5569",
                        "port": 1
                    },
                    {
                        "id": "91a4cf63.15d19",
                        "port": 0
                    },
                    {
                        "id": "c4a276dc.77f7f8",
                        "port": 0
                    }
                    ]
                },
                {
                    "x": 954.5,
                    "y": 469,
                    "wires": [
                    {
                        "id": "f3642a69.695c18",
                        "port": 0
                    },
                    {
                        "id": "d3934e72.423c6",
                        "port": 0
                    },
                    {
                        "id": "a8dae174.9eb51",
                        "port": 0
                    }
                    ]
                }
                ],
                "info": "",
                "name": "convert and merge tmp tdo to original one",
                "type": "subflow",
                "category": "",
                "outputLabels": [
                "ok",
                "error",
                "info"
                ]
            },
            {
                "id": "9e1aadb6.fb685",
                "in": [
                {
                    "x": 210,
                    "y": 326,
                    "wires": [
                    {
                        "id": "a318cf69.01b5c"
                    }
                    ]
                }
                ],
                "out": [
                {
                    "x": 1051.5,
                    "y": 509,
                    "wires": [
                    {
                        "id": "ed8f357.f7871c8",
                        "port": 0
                    }
                    ]
                }
                ],
                "info": "",
                "name": "searchQuery to tdoData: search then scroll (2)",
                "type": "subflow",
                "category": ""
            },
            {
                "id": "2ae8386f.5eb628",
                "in": [
                {
                    "x": 210,
                    "y": 326,
                    "wires": [
                    {
                        "id": "6da02059.5bf9a"
                    }
                    ]
                }
                ],
                "out": [
                {
                    "x": 1051.5,
                    "y": 509,
                    "wires": [
                    {
                        "id": "ca14a12a.211a1",
                        "port": 0
                    }
                    ]
                }
                ],
                "info": "",
                "name": "searchQuery to tdoData: search then scroll (3)",
                "type": "subflow",
                "category": ""
            },
            {
                "id": "2dbe3ce9.b79b84",
                "in": [
                {
                    "x": 750,
                    "y": 305,
                    "wires": [
                    {
                        "id": "ffe2c52f.68a9c8"
                    }
                    ]
                }
                ],
                "out": [
                {
                    "x": 1707,
                    "y": 232,
                    "wires": [
                    {
                        "id": "afeaddb.f22342",
                        "port": 0
                    },
                    {
                        "id": "ffe2c52f.68a9c8",
                        "port": 0
                    }
                    ]
                }
                ],
                "info": "",
                "name": "Poll Delay",
                "type": "subflow",
                "category": ""
            },
            {
                "z": "",
                "id": "8c984b32.2278f8",
                "sid": "ACb2875ef4c867b827d86d5fc81e87924f",
                "from": "+19492844918",
                "name": "dev+twilio",
                "type": "twilio-api"
            },
            {
                "z": "",
                "id": "16b4d4b.5fc2d2b",
                "path": "wss://push.aws-prod-rt.veritone.com/socket",
                "type": "websocket-listener",
                "wholemsg": "false"
            },
            {
                "z": "",
                "id": "abc33169.86e5b",
                "tls": "",
                "path": "wss://push.aws-prod-rt.veritone.com/socket",
                "type": "websocket-client",
                "wholemsg": "false"
            },
            {
                "z": "",
                "id": "7a580772.be25e8",
                "path": "/public/initiate",
                "type": "websocket-listener",
                "wholemsg": "false"
            },
            {
                "z": "",
                "db": "analytics",
                "id": "8bd6804.d6fb68",
                "ssl": false,
                "port": "5432",
                "type": "postgresdb",
                "hostname": "0.pg-analytics.aws-prod.veritone.com"
            },
            {
                "z": "",
                "id": "3cd64946.66cbb6",
                "type": "twitter-credentials",
                "screen_name": "VitAnh50937021"
            },
            {
                "z": "",
                "id": "e28f2f3a.41cc9",
                "sid": "AC_REDACTED_TWILIO_SID",
                "from": "+15404460488",
                "name": "",
                "type": "twilio-api"
            },
            {
                "x": 274.5,
                "y": 226,
                "z": "b089ae99.235e",
                "id": "d2d49ad3.9f0fe8",
                "func": "/*This is a template for the Business Logic for creating a Cognitive Engine */\n\n//1. Get the Primary media asset from Veritone\n\n\n\n//2. Pass in your 3rd Party API Token here:\nmsg.apiToken = ''<API Token>'';\n//3. create your API Header details\nmsg.headers = {''Content-Type'':''application/json'',''Authorization'':''Bearer'' + msg.apiToken};\nmsg.url = ''<3rd party API uri>'';\n\n\nreturn msg;",
                "name": "Setup Variables",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2096afb8.9b434"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 522.5,
                "y": 226,
                "z": "b089ae99.235e",
                "id": "2096afb8.9b434",
                "ret": "txt",
                "tls": "",
                "url": "",
                "name": "Call 3rd Party API (transcription)",
                "type": "http request",
                "wires": [
                [
                    "a0c6261e.6a7d58"
                ]
                ],
                "method": "POST"
            },
            {
                "x": 1087.5,
                "y": 193,
                "z": "b089ae99.235e",
                "id": "2db9ef6.d92801",
                "drop": false,
                "name": "Poll the API for Response (20s)",
                "rate": "1",
                "type": "delay",
                "wires": [
                [
                    "328c8b79.ea1674"
                ]
                ],
                "timeout": "20",
                "pauseType": "delay",
                "rateUnits": "second",
                "randomLast": "5",
                "nbRateUnits": "1",
                "randomFirst": "1",
                "randomUnits": "seconds",
                "timeoutUnits": "seconds"
            },
            {
                "x": 790.5,
                "y": 225,
                "z": "b089ae99.235e",
                "id": "a0c6261e.6a7d58",
                "name": "API Response?",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "running",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "complete",
                    "vt": "str"
                }
                ],
                "wires": [
                [
                    "2db9ef6.d92801",
                    "bab5a2c7.b2ede"
                ],
                [
                    "bab5a2c7.b2ede",
                    "71341ca.92552e4"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "true",
                "property": "payload",
                "propertyType": "msg"
            },
            {
                "x": 466.5,
                "y": 106,
                "z": "b089ae99.235e",
                "id": "328c8b79.ea1674",
                "func": "//Format the API Request to adhere to 3rd Party API\nreturn msg;",
                "name": "Format API Request",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "51ef2e.d634f0d4"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 702,
                "y": 106,
                "z": "b089ae99.235e",
                "id": "51ef2e.d634f0d4",
                "ret": "txt",
                "tls": "",
                "url": "",
                "name": "Call 3rd Party API",
                "type": "http request",
                "wires": [
                [
                    "a0c6261e.6a7d58"
                ]
                ],
                "method": "POST"
            },
            {
                "x": 1018.5,
                "y": 91,
                "z": "b089ae99.235e",
                "id": "bab5a2c7.b2ede",
                "name": "Log Results",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "payload",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 888.5,
                "y": 324,
                "z": "b089ae99.235e",
                "id": "71341ca.92552e4",
                "func": "\nreturn msg;",
                "name": "Format Response",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 485,
                "y": 884,
                "z": "df031bce.f63348",
                "id": "769bc735.746c68",
                "func": "msg.tdoDataOffset = 0;\nmsg.tdoDataLimit = 50;\nreturn msg;",
                "name": "batch update tdo tags and insert-into-index",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "71f8643e.b90fdc"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 443,
                "y": 961,
                "z": "df031bce.f63348",
                "id": "71f8643e.b90fdc",
                "func": "const containsTagValue = function(tags, value) {\n    return !!tags.find(tag => tag.value === value);\n}\n\nconst updateTdoQueries = [];\n\nfor (let i = msg.tdoDataOffset; i < msg.tdoDataOffset + msg.tdoDataLimit && !!msg.tdoData[i]; i++) {\n    if (!msg.tdoData[i].tdo) {\n        continue;\n    }\n    const tdo = msg.tdoData[i].tdo;\n    let tdoTagsToApply = [];\n    if (tdo.details && tdo.details.tags && tdo.details.tags.length) {\n        tdoTagsToApply = tdo.details.tags;\n    }\n    for (let j = 0; j < msg.tags.length; j++) {\n        const newTag = msg.tags[j];\n        if (!newTag) {\n            continue;\n        }\n        if (typeof newTag === ''string'' && !containsTagValue(tdoTagsToApply, newTag)) {\n            tdoTagsToApply.push({ value: newTag});\n        } else if (!!newTag && typeof newTag.value === ''string'' && !containsTagValue(tdoTagsToApply, newTag.value)) {\n            tdoTagsToApply.push(newTag);\n        }\n    }\n    if (!tdoTagsToApply.length) {\n        continue;\n    }\n    const tagQueries = [];\n    for (let k = 0; k < tdoTagsToApply.length; k++) {\n        const tag = tdoTagsToApply[k];\n        if (tag.label) {\n            tagQueries.push(''{ label: \"${tag.label}\", value: \"${tag.value}\" }'');\n        } else {\n            tagQueries.push(''{ value: \"${tag.value}\" }'');\n        }\n    }\n    if (!tagQueries.length) {\n        continue;\n    }\n    updateTdoQueries.push(''\n        tdo_${tdo.id}: updateTDO( input: {\n            id: \"${tdo.id}\"\n            details: {\n                tags: [${tagQueries.join('', '')}]\n            }\n      }) { id }\n    '');\n}\n\nmsg.updateTdoQueries = updateTdoQueries;\n\nreturn msg;",
                "name": "prepare update queries",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "e46785c6.23e338"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 700,
                "y": 961,
                "z": "df031bce.f63348",
                "id": "e46785c6.23e338",
                "name": "has updates to make",
                "type": "switch",
                "rules": [
                {
                    "t": "gt",
                    "v": "0",
                    "vt": "num"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "30be394b.126646"
                ],
                [
                    "1fdc0407.5d477c"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "updateTdoQueries.length",
                "propertyType": "msg"
            },
            {
                "x": 1032,
                "y": 1021,
                "z": "df031bce.f63348",
                "id": "30be394b.126646",
                "func": "msg.updateQuery = msg.updateTdoQueries.join(''\\n'');\ndelete msg.updateTdoQueries;\nreturn msg;",
                "name": "to single update query",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "e8ad57da.94b5c8"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 1084,
                "y": 1142,
                "z": "df031bce.f63348",
                "id": "352dddc4.b2e872",
                "func": "const indexQueries = [];\nconst updateResults = Object.values(msg.payload);\nupdateResults.forEach(result => {\n    indexQueries.push(''\n        index_${result.id}: createJob(input: {\n            targetId: \"${result.id}\",\n            tasks: [\n              {\n                engineId: \"insert-into-index\"\n              }\n            ]\n          }) {\n            id\n            status\n            tasks {\n              records {\n                id\n                status\n              }\n            }\n          }\n    '');\n});\n\nmsg.insertIntoIndexQuery = indexQueries.join(''\\n'');\n\nreturn msg;",
                "name": "extract tdo ids to run insert-into-index",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "f44fcc53.aa019"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 1027,
                "y": 1079,
                "z": "df031bce.f63348",
                "id": "e8ad57da.94b5c8",
                "name": "update tdos batch",
                "type": "aiware",
                "wires": [
                [
                    "352dddc4.b2e872"
                ],
                [
                    "f80dd43c.1066a8"
                ]
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "mutation {\n  {{{updateQuery}}}\n}"
            },
            {
                "x": 1033.5,
                "y": 1197,
                "z": "df031bce.f63348",
                "id": "f44fcc53.aa019",
                "name": "run insert into index",
                "type": "aiware",
                "wires": [
                [
                    "1fdc0407.5d477c"
                ],
                [
                    "4085fff4.6b05d"
                ]
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "mutation {\n  {{{insertIntoIndexQuery}}}\n}"
            },
            {
                "x": 862,
                "y": 1291,
                "z": "df031bce.f63348",
                "id": "1fdc0407.5d477c",
                "func": "msg.tdoDataOffset += msg.tdoDataLimit;\ndelete msg.updateQuery;\ndelete msg.insertIntoIndexQuery;\ndelete msg.payload;\nreturn msg;",
                "name": "next batch",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "a68c629a.9931a"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 481,
                "y": 1388,
                "z": "df031bce.f63348",
                "id": "a68c629a.9931a",
                "name": "has more data",
                "type": "switch",
                "rules": [
                {
                    "t": "lt",
                    "v": "tdoData.length",
                    "vt": "msg"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "71f8643e.b90fdc"
                ],
                [
                    "4561dffc.8deeb"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "tdoDataOffset",
                "propertyType": "msg"
            },
            {
                "x": 1336.5,
                "y": 1207,
                "z": "df031bce.f63348",
                "id": "4085fff4.6b05d",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 1341.5,
                "y": 1090,
                "z": "df031bce.f63348",
                "id": "f80dd43c.1066a8",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 769.5,
                "y": 1393,
                "z": "df031bce.f63348",
                "id": "4561dffc.8deeb",
                "func": "delete msg.tdoDataOffset;\ndelete msg.tdoDataLimit;\ndelete msg.payload;\nreturn msg;",
                "name": "cleanup msg",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 733.2500190734863,
                "y": 461.50001525878906,
                "z": "4e4df670.895218",
                "id": "e038e4ba.c92ac8",
                "name": "has results",
                "type": "switch",
                "rules": [
                {
                    "t": "gt",
                    "v": "0",
                    "vt": "num"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "762bd9a7.6f3508"
                ],
                [
                    "6fc18001.19252"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "payload.records.length",
                "propertyType": "msg"
            },
            {
                "x": 587.7500381469727,
                "y": 650.5000133514404,
                "z": "4e4df670.895218",
                "id": "762bd9a7.6f3508",
                "func": "msg.payload.records\n    .forEach(record => {\n        msg.tdoIds.push(record.mediaId);\n    });\n    \nreturn msg;",
                "name": "process results",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "9aee4f06.ac982",
                    "8da2dfbf.28cf3"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 738.2500228881836,
                "y": 386.00001335144043,
                "z": "4e4df670.895218",
                "id": "d36f4e8b.2501b",
                "ret": "obj",
                "tls": "",
                "url": "https://api.aws-dev.veritone.com/api/search/file_search_authtoken",
                "name": "call search file api",
                "type": "http request",
                "wires": [
                [
                    "e038e4ba.c92ac8"
                ]
                ],
                "method": "POST"
            },
            {
                "x": 705.5000228881836,
                "y": 322.0000114440918,
                "z": "4e4df670.895218",
                "id": "bcea8a33.9fb488",
                "func": "// prepare to call file_search\nif (!msg.tdoIds) {\n    msg.tdoIds = [];\n}\nmsg.payload = msg.searchQuery;\nmsg.payload.limit = msg.searchLimit;\nmsg.payload.offset = msg.searchOffset;\nmsg.headers = {\n    ''Content-Type'': ''application/json'',\n    ''Authorization'': msg.httpAuthorization || msg.debugAuthorization\n};\nreturn msg;",
                "name": "prepare call",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "d36f4e8b.2501b"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 979.750129699707,
                "y": 448.75006222724915,
                "z": "4e4df670.895218",
                "id": "6fc18001.19252",
                "func": "msg.tdoData = [];\nconst uniqueTdoIds = new Set(msg.tdoIds);\nuniqueTdoIds.forEach(tdoId => {\n    msg.tdoData.push({\n        tdoId\n    });\n});\n\ndelete msg.tdoIds;\ndelete msg.searchOffset;\ndelete msg.searchLimit;\ndelete msg.statusCode;\ndelete msg.responseUrl;\ndelete msg.headers;\ndelete msg.httpAuthirozation;\ndelete msg.payload;\n\nreturn msg;",
                "name": "tdo ids to tdoData",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 485.25001525878906,
                "y": 383.2500171661377,
                "z": "4e4df670.895218",
                "id": "d1da0006.10ed7",
                "drop": false,
                "name": "",
                "rate": "1",
                "type": "delay",
                "wires": [
                [
                    "d36f4e8b.2501b"
                ]
                ],
                "timeout": "100",
                "pauseType": "delay",
                "rateUnits": "second",
                "randomLast": "5",
                "nbRateUnits": "1",
                "randomFirst": "1",
                "randomUnits": "seconds",
                "timeoutUnits": "milliseconds"
            },
            {
                "x": 928.5001258850098,
                "y": 645.0000171661377,
                "z": "4e4df670.895218",
                "id": "c81780ec.50a82",
                "name": "subMsg",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 771.250072479248,
                "y": 648.750020980835,
                "z": "4e4df670.895218",
                "id": "9aee4f06.ac982",
                "name": "log ?",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "0",
                    "vt": "num"
                }
                ],
                "wires": [
                [
                    "c81780ec.50a82"
                ]
                ],
                "repair": false,
                "outputs": 1,
                "checkall": "true",
                "property": "msg.tdoIds.length % 1000",
                "propertyType": "jsonata"
            },
            {
                "x": 494.00006103515625,
                "y": 455.50001335144043,
                "z": "4e4df670.895218",
                "id": "8da2dfbf.28cf3",
                "func": "msg.payload = msg.searchQuery;\nmsg.payload.limit = msg.searchLimit;\nmsg.searchOffset += msg.searchLimit;\nmsg.payload.offset = msg.searchOffset;\n\nmsg.headers = {\n    ''Content-Type'': ''application/json'',\n    ''Authorization'': msg.httpAuthorization || msg.debugAuthorization\n};\n\nreturn msg;",
                "name": "prepare next page",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "d1da0006.10ed7"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 347,
                "y": 220,
                "z": "a8e76fb0.fc608",
                "id": "22c759b.79ed2a6",
                "func": "//Node has 2 outputs - 1 for itteration and 1 for completion\nvar nextObj, out;\nvar itt = msg.iterationInfo;\n\n//If the iterating has not yet begun set up the iteration metadata in the msg\nif (typeof itt === ''undefined'') {\n    //Make sure payload is an array\n    if( Object.prototype.toString.call(msg.payload) !== ''[object Array]'' ) {\n       msg.payload = [msg.payload];\n    }\n\n    msg.iterationInfo = itt = {};\n    itt.index = -1;\n    itt.inArray = msg.payload;\n    itt.outArray = [];\n\n//Otherwise just push the input to the output array\n} else {\n    itt.outArray.push(msg.payload)\n}\n\n//Goto next object\nitt.index ++;\n\n//If there are stil objects left to iterate goto the next one in the original array\nif (itt.index < itt.inArray.length) {\n    nextObj = msg;\n    msg.payload = itt.inArray[itt.index];\n\n//otherwise pass the out array as the payload\n} else {\n    out = msg;\n    msg.payload = itt.outArray;\n    delete msg.iterationInfo;\n}\n\nreturn [nextObj, out];",
                "name": "Iterate",
                "type": "function",
                "noerr": 0,
                "wires": [
                [],
                []
                ],
                "outputs": "2"
            },
            {
                "x": 634.0173301696777,
                "y": 177.82982921600342,
                "z": "232d4eac.aef9c2",
                "id": "6675f737.467ce8",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 895.2048645019531,
                "y": 77,
                "z": "232d4eac.aef9c2",
                "id": "5eeeb0e2.4d95d",
                "name": "nguyen.nhan.k60@gmail.com",
                "port": "587",
                "type": "e-mail",
                "dname": "send email",
                "wires": [],
                "secure": false,
                "server": "smtp.mandrillapp.com"
            },
            {
                "x": 671.2117881774902,
                "y": 76.71176719665527,
                "z": "232d4eac.aef9c2",
                "id": "f52b83c7.1b2a7",
                "func": "\nmsg.attachments = [{\n    filename: ''result.mp4'',\n    path: ''data:video/mp4;base64,'' + msg.payload\n\n}];\nmsg.payload = ''result of engine'';\nmsg.topic = \"VTN-27344\";\n\nreturn msg;",
                "name": "set email content",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "5eeeb0e2.4d95d"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 345,
                "y": 746,
                "z": "3d395a22.2c5d36",
                "id": "3bedbcd8.a8c004",
                "ret": "txt",
                "tls": "",
                "url": "{{{signedUrl}}}",
                "name": "upload asset to writable url",
                "type": "http request",
                "wires": [
                [
                    "b9aa6df0.efe65"
                ]
                ],
                "method": "PUT"
            },
            {
                "x": 352.5,
                "y": 565,
                "z": "3d395a22.2c5d36",
                "id": "6c052997.4f0ee8",
                "name": "get writable url and asset url",
                "type": "aiware",
                "wires": [
                [
                    "2dfbacf4.f82904"
                ],
                []
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "{\n  getSignedWritableUrl {\n    url\n    unsignedUrl\n    getUrl\n  }\n}"
            },
            {
                "x": 330.5,
                "y": 654,
                "z": "3d395a22.2c5d36",
                "id": "2dfbacf4.f82904",
                "func": "msg.writableUrls = {\n    url: msg.payload.getSignedWritableUrl.url,\n    unsignedUrl: msg.payload.getSignedWritableUrl.unsignedUrl,\n    getUrl: msg.payload.getSignedWritableUrl.getUrl\n}\n//msg.url = msg.writableUrls.url; //Issue: Overwritten GraphQL URL\nmsg.signedUrl = msg.writableUrls.url;\n// msg.unsignedUrl = msg.writableUrls.unsignedUrl;\nmsg.payload = msg.vtnStandardAsset;\nmsg.headers = {};\nmsg.headers[''Content-Type''] = ''application/json''\nreturn msg;",
                "name": "prepare upload asset",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "3bedbcd8.a8c004"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 292.5,
                "y": 828,
                "z": "3d395a22.2c5d36",
                "id": "b9aa6df0.efe65",
                "name": "http 200 ?",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "200",
                    "vt": "num"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "cd70b363.e939d"
                ],
                [
                    "d3934e72.423c6"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "statusCode",
                "propertyType": "msg"
            },
            {
                "x": 310.5,
                "y": 997,
                "z": "3d395a22.2c5d36",
                "id": "90411c08.90ecf",
                "name": "create asset record",
                "type": "aiware",
                "wires": [
                [
                    "eebd538e.bdaff",
                    "36ba2ee9.e46352"
                ],
                []
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "mutation {\n  createAsset(input: {\n    containerId: \"{{{originalTdoId}}}\",\n    name:\"{{{sdoName}}}\"\n    assetType: \"vtn-standard\",\n    contentType: \"application/json\",\n    uri: \"{{{writableUrls.unsignedUrl}}}\"\n  }) {\n    id,\n    name\n  }\n}"
            },
            {
                "x": 317.5,
                "y": 1086,
                "z": "3d395a22.2c5d36",
                "id": "eebd538e.bdaff",
                "name": "is able to create asset",
                "type": "switch",
                "rules": [
                {
                    "t": "nnull"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "aefe51fc.d57c7"
                ],
                [
                    "91a4cf63.15d19"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "payload.createAsset.id",
                "propertyType": "msg"
            },
            {
                "x": 334.5,
                "y": 494,
                "z": "3d395a22.2c5d36",
                "id": "92168bda.43dfa8",
                "name": "has asset data to write",
                "type": "switch",
                "rules": [
                {
                    "t": "nnull"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "6c052997.4f0ee8"
                ],
                [
                    "f3642a69.695c18"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "vtnStandardAsset",
                "propertyType": "msg"
            },
            {
                "x": 324,
                "y": 904,
                "z": "3d395a22.2c5d36",
                "id": "cd70b363.e939d",
                "func": "//A dummy tdo is created for convert transcript to entity extraction file, \n// the name for the dummy tdo is tmpTranscriptInternal-original tdo id\nmsg.originalTdoId = msg.tdoId\nconst nameParts = msg.tdo.name.split(''-'')\nif (nameParts.length === 2 && ''tmpTranscriptInternal'' === nameParts[0]) {\n    msg.originalTdoId = nameParts[1]\n}\nmsg.sdoName = msg.file.sdoFilePrefix + msg.originalTdoId + ''-file.json''\nreturn msg;",
                "name": "Prepare Create Asset",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "90411c08.90ecf"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 330,
                "y": 277,
                "z": "3d395a22.2c5d36",
                "id": "9d61a184.720bd",
                "ret": "obj",
                "tls": "",
                "url": "{{{entityExtractionFileUrl}}}",
                "name": "Get Entity Extracted",
                "type": "http request",
                "wires": [
                [
                    "9c064076.95deb"
                ]
                ],
                "method": "GET"
            },
            {
                "x": 337,
                "y": 413,
                "z": "3d395a22.2c5d36",
                "id": "de37df1c.6f93c",
                "func": "msg.vtnStandardAsset = null\nif (!msg.payload || !msg.payload.object) {\n    return msg;\n}\n\nconst vtnObjs = msg.payload.object\n\nmsg.assetContentType = ''application/json'';\nmsg.assetType = \"vtn-standard\";\nmsg.assetFileData = {\n    assetType: msg.assetType,\n    contentType: msg.assetContentType,\n    metadata: {\n        \"schemaIds\": [\n            msg.file.schemaId\n        ],\n        \"sourceEngineId\": msg.file.engineId\n    },\n};\n\nlet durationMs = new Date(msg.tdo.stopDateTime).getTime() - new Date(msg.tdo.startDateTime).getTime();\ndurationMs = durationMs <= 0 ? 1000 : durationMs;\ndurationMs = durationMs > 1 ? durationMs - 1 : durationMs;\n\n//var half_length = Math.ceil(entities.length / 8);\n//var leftSide = entities.splice(0,half_length);\nconst series = [];\nif (msg.file.engineId === msg.entityExtractionEngineID) {\n    vtnObjs.forEach(object => {\n        if (!object) {\n            node.warn(\"no object in entity extraction file\")\n            return msg;\n        }\n        if (!object.objectCategory || object.objectCategory.length < 1) {\n            node.warn(\"no objectCategory in entity extraction file\")\n            return msg;\n        }\n        series.push({\n            \"startTimeMs\": 0,\n            \"stopTimeMs\": durationMs,\n            \"structuredData\": {\n                [msg.file.schemaId]: {\n                    \"type\": object.objectCategory[0].class,\n                    \"count\": 1,\n                    \"entity\": object.label\n                }\n            }\n        });\n    });\n} else if (msg.file.engineId === msg.contentClassificationEngineID) {\n    vtnObjs.forEach(object => {\n        if (!object) {\n            node.warn(\"no object in content classification file\")\n            return msg;\n        }\n        if (!object.objectCategory || object.objectCategory.length < 1) {\n            node.warn(\"no objectCategory in content classification file\")\n            return msg;\n        }\n        series.push({\n            \"startTimeMs\": 0,\n            \"stopTimeMs\": durationMs,\n            \"structuredData\": {\n                [msg.file.schemaId]: {\n                    \"topic\": object.objectCategory[0].class\n                }\n            }\n        });\n    });\n} else {\n    node.error(''unexpected engine ${msg.file.engineId}'', msg);\n}\n\n\nconst vtnStandardAsset = {\n    series,\n    \"sourceEngineId\": msg.file.engineId,\n    \"validationContracts\": [\n        msg.file.schemaId\n    ]\n};\n    \n\nmsg.vtnStandardAsset = vtnStandardAsset;\n\nreturn msg;",
                "name": "vtn-standard to sdo",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "92168bda.43dfa8"
                ]
                ],
                "outputs": 1,
                "outputLabels": [
                "msg"
                ]
            },
            {
                "x": 811,
                "y": 127,
                "z": "3d395a22.2c5d36",
                "id": "19fdf6b6.3d5569",
                "name": "delete tmp tdo",
                "type": "aiware",
                "wires": [
                [],
                []
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "mutation {\n    deleteTDO(id: {{{tdoId}}})\n    {\n        id\n    }\n}"
            },
            {
                "x": 707,
                "y": 469,
                "z": "3d395a22.2c5d36",
                "id": "f3642a69.695c18",
                "func": "msg.infoOutput = {}\nmsg.infoOutput.reasone=''No assets to process for tdo '' + msg.tdoId\nreturn msg;",
                "name": "log not assets",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 678,
                "y": 831,
                "z": "3d395a22.2c5d36",
                "id": "d3934e72.423c6",
                "func": "myError = {};\nmyError.tdoId= msg.tdoId\nmyError.cause = ''upload asset file error'';\nmyError.httpStatus = msg.statusCode;\nmyError.url = msg.signedUrl;\nif (!msg.error) {\n    msg.error = {};\n}\nmsg.error.myError = myError;\n\nreturn msg;",
                "name": "log unable to upload asset",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 673,
                "y": 1049,
                "z": "3d395a22.2c5d36",
                "id": "91a4cf63.15d19",
                "func": "myError = {};\nmyError.tdoId= msg.originalTdoId\nmyError.cause = ''create asset error'';\nif (!msg.error) {\n    msg.error = {};\n}\nmsg.error.myError = myError;\n\nreturn msg;",
                "name": "log unable to create asset",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 595,
                "y": 988,
                "z": "3d395a22.2c5d36",
                "id": "36ba2ee9.e46352",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "false",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 303,
                "y": 351,
                "z": "3d395a22.2c5d36",
                "id": "9c064076.95deb",
                "name": "http 200 ?",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "200",
                    "vt": "num"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "de37df1c.6f93c"
                ],
                [
                    "c4a276dc.77f7f8"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "statusCode",
                "propertyType": "msg"
            },
            {
                "x": 680,
                "y": 361,
                "z": "3d395a22.2c5d36",
                "id": "c4a276dc.77f7f8",
                "func": "myError = {};\nmyError.tdoId= msg.tdoId\nmyError.cause = ''get file error'';\nmyError.httpStatus = msg.statusCode;\nmyError.url = msg.entityExtractionFileUrl;\nif (!msg.error) {\n    msg.error = {};\n}\nmsg.error.myError = myError;\n\nreturn msg;",
                "name": "log get file error",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 620,
                "y": 132,
                "z": "3d395a22.2c5d36",
                "id": "d65b591e.282c48",
                "name": "is tmp tdo",
                "type": "switch",
                "rules": [
                {
                    "t": "true"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "19fdf6b6.3d5569"
                ],
                [
                    "a8dae174.9eb51"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "isTmpTdo",
                "propertyType": "msg"
            },
            {
                "x": 648,
                "y": 199,
                "z": "3d395a22.2c5d36",
                "id": "a8dae174.9eb51",
                "func": "msg.infoOutput = {}\nmsg.infoOutput.reasone=''Not tmp tdo '' + msg.tdoId\nreturn msg;",
                "name": "log - not tmp tdo",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 205,
                "y": 58,
                "z": "3d395a22.2c5d36",
                "id": "95cedfd7.08e2c",
                "func": "msg.fileIndex = 0;\n\nreturn msg;",
                "name": "prepare loop",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "e55827b0.b2b748"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 208,
                "y": 125,
                "z": "3d395a22.2c5d36",
                "id": "e55827b0.b2b748",
                "name": "has more files",
                "type": "switch",
                "rules": [
                {
                    "t": "lt",
                    "v": "fileNeed.length",
                    "vt": "msg"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "33e89e87.c8d482"
                ],
                [
                    "961b44c7.132698"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "fileIndex",
                "propertyType": "msg"
            },
            {
                "x": 280,
                "y": 203,
                "z": "3d395a22.2c5d36",
                "id": "33e89e87.c8d482",
                "func": "msg.file = msg.fileNeed[msg.fileIndex];\nmsg.entityExtractionFileUrl = msg.file.url\nreturn msg;",
                "name": "set file",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "9d61a184.720bd"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 270,
                "y": 1262,
                "z": "3d395a22.2c5d36",
                "id": "c6a70020.68fd8",
                "func": "msg.fileIndex += 1;\nreturn msg;",
                "name": "increment index",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "e55827b0.b2b748"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 440,
                "y": 133,
                "z": "3d395a22.2c5d36",
                "id": "961b44c7.132698",
                "func": "//A dummy tdo is created for convert transcript to entity extraction/content classification file, \n// the name for the dummy tdo is tmpTranscriptInternal-original tdo id\nmsg.isTmpTdo = false\nconst nameParts = msg.tdo.name.split(''-'')\nif (nameParts.length === 2 && ''tmpTranscriptInternal'' === nameParts[0]) {\n    msg.isTmpTdo = true\n}\nreturn msg;",
                "name": "check tmp tdo",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "d65b591e.282c48"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 299,
                "y": 1176,
                "z": "3d395a22.2c5d36",
                "id": "aefe51fc.d57c7",
                "name": "run insert into index",
                "type": "aiware",
                "wires": [
                [
                    "c6a70020.68fd8",
                    "c782f0ad.d9dd"
                ],
                [
                    "3fac460f.52f28a"
                ]
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "mutation {\n  createJob(input: {\n    targetId: \"{{{originalTdoId}}}\",\n    tasks: [\n      {\n        engineId: \"insert-into-index\",\n        payload: {\n            recordingId: \"{{{originalTdoId}}}\",\n            assetId: \"{{{payload.createAsset.id}}}\"\n        }\n      }\n    ]\n  }) {\n    id\n    status\n    tasks {\n      records {\n        id\n        status\n      }\n    }\n  }\n}"
            },
            {
                "x": 677.75,
                "y": 1175.2498779296875,
                "z": "3d395a22.2c5d36",
                "id": "3fac460f.52f28a",
                "func": "myError = {};\nmyError.tdoId = msg.originalTdoId\nmyError.error = msg.payload;\nnode.warn(''unable insert to index - ${JSON.stringify(myError)}'');\nreturn msg;",
                "name": "log unable to insert index",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "c6a70020.68fd8"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 589,
                "y": 1124,
                "z": "3d395a22.2c5d36",
                "id": "c782f0ad.d9dd",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "payload",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 621,
                "y": 384,
                "z": "9e1aadb6.fb685",
                "id": "4c93d56a.2dabfc",
                "name": "has results",
                "type": "switch",
                "rules": [
                {
                    "t": "gt",
                    "v": "0",
                    "vt": "num"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "1109fd35.2030d3"
                ],
                [
                    "ed8f357.f7871c8"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "payload.records.length",
                "propertyType": "msg"
            },
            {
                "x": 826,
                "y": 387,
                "z": "9e1aadb6.fb685",
                "id": "1109fd35.2030d3",
                "func": "msg.payload.records\n    .forEach(record => {\n        msg.tdoIds.push(record.mediaId);\n    });\n    \nreturn msg;",
                "name": "process results",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2e562fe7.c977a"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 381,
                "y": 389,
                "z": "9e1aadb6.fb685",
                "id": "6435eb8.ac6ce14",
                "ret": "obj",
                "tls": "",
                "url": "{{{searchQueryUrl}}}",
                "name": "call search file api",
                "type": "http request",
                "wires": [
                [
                    "a2b62e.40cee9d"
                ]
                ],
                "method": "POST"
            },
            {
                "x": 360,
                "y": 326,
                "z": "9e1aadb6.fb685",
                "id": "a318cf69.01b5c",
                "func": "// prepare to call file_search\nif (!msg.tdoIds) {\n    msg.tdoIds = [];\n}\nmsg.payload = msg.searchQuery;\nmsg.payload.limit = msg.searchLimit;\nmsg.payload.offset = msg.searchOffset;\nmsg.headers = {\n    ''Content-Type'': ''application/json'',\n    ''Authorization'': msg.httpAuthorization || msg.debugAuthorization\n};\nreturn msg;",
                "name": "prepare call",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "6435eb8.ac6ce14"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 833,
                "y": 509,
                "z": "9e1aadb6.fb685",
                "id": "ed8f357.f7871c8",
                "func": "msg.tdoData = [];\nconst uniqueTdoIds = new Set(msg.tdoIds);\nuniqueTdoIds.forEach(tdoId => {\n    msg.tdoData.push({\n        tdoId\n    });\n});\n\ndelete msg.tdoIds;\ndelete msg.searchOffset;\ndelete msg.searchLimit;\ndelete msg.statusCode;\ndelete msg.responseUrl;\ndelete msg.headers;\ndelete msg.httpAuthirozation;\ndelete msg.payload;\n\nreturn msg;",
                "name": "tdo ids to tdoData",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 148.5,
                "y": 511,
                "z": "9e1aadb6.fb685",
                "id": "d3f554fc.9686e8",
                "drop": false,
                "name": "",
                "rate": "1",
                "type": "delay",
                "wires": [
                [
                    "6435eb8.ac6ce14"
                ]
                ],
                "timeout": "100",
                "pauseType": "delay",
                "rateUnits": "second",
                "randomLast": "5",
                "nbRateUnits": "1",
                "randomFirst": "1",
                "randomUnits": "seconds",
                "timeoutUnits": "milliseconds"
            },
            {
                "x": 393.5,
                "y": 452,
                "z": "9e1aadb6.fb685",
                "id": "2e562fe7.c977a",
                "func": "msg.payload = msg.searchQuery;\nmsg.payload.limit = msg.searchLimit;\nmsg.searchOffset += msg.searchLimit;\nmsg.payload.offset = msg.searchOffset;\n\nmsg.headers = {\n    ''Content-Type'': ''application/json'',\n    ''Authorization'': msg.httpAuthorization || msg.debugAuthorization\n};\n\nreturn msg;",
                "name": "prepare next page",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "d3f554fc.9686e8"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 594.5,
                "y": 309,
                "z": "9e1aadb6.fb685",
                "id": "a2b62e.40cee9d",
                "name": "200?",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "200",
                    "vt": "str"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "4c93d56a.2dabfc"
                ],
                [
                    "f94fe2b0.2946c"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "true",
                "property": "statusCode",
                "propertyType": "msg"
            },
            {
                "x": 775.5,
                "y": 311,
                "z": "9e1aadb6.fb685",
                "id": "f94fe2b0.2946c",
                "func": "node.error(''http error status ${msg.statusCode} - ${JSON.stringify(msg.payload)}'', msg)\nreturn msg;",
                "name": "log error",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 621,
                "y": 384,
                "z": "2ae8386f.5eb628",
                "id": "e03a0696.ed5c98",
                "name": "has results",
                "type": "switch",
                "rules": [
                {
                    "t": "gt",
                    "v": "0",
                    "vt": "num"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "7285f511.10887c"
                ],
                [
                    "ca14a12a.211a1"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "false",
                "property": "payload.records.length",
                "propertyType": "msg"
            },
            {
                "x": 826,
                "y": 387,
                "z": "2ae8386f.5eb628",
                "id": "7285f511.10887c",
                "func": "msg.payload.records\n    .forEach(record => {\n        msg.tdoIds.push(record.mediaId);\n    });\n    \nreturn msg;",
                "name": "process results",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "6246656d.54640c"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 381,
                "y": 389,
                "z": "2ae8386f.5eb628",
                "id": "33413944.c9c5c6",
                "ret": "obj",
                "tls": "",
                "url": "{{{searchQueryUrl}}}",
                "name": "call search file api",
                "type": "http request",
                "wires": [
                [
                    "41a8d87c.8d47d8"
                ]
                ],
                "method": "POST"
            },
            {
                "x": 360,
                "y": 326,
                "z": "2ae8386f.5eb628",
                "id": "6da02059.5bf9a",
                "func": "// prepare to call file_search\nif (!msg.tdoIds) {\n    msg.tdoIds = [];\n}\nmsg.payload = msg.searchQuery;\nmsg.payload.limit = msg.searchLimit;\nmsg.payload.offset = msg.searchOffset;\nmsg.headers = {\n    ''Content-Type'': ''application/json'',\n    ''Authorization'': msg.httpAuthorization || msg.debugAuthorization\n};\nreturn msg;",
                "name": "prepare call",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "33413944.c9c5c6"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 833,
                "y": 509,
                "z": "2ae8386f.5eb628",
                "id": "ca14a12a.211a1",
                "func": "msg.tdoData = [];\nconst uniqueTdoIds = new Set(msg.tdoIds);\nuniqueTdoIds.forEach(tdoId => {\n    msg.tdoData.push({\n        tdoId\n    });\n});\n\ndelete msg.tdoIds;\ndelete msg.searchOffset;\ndelete msg.searchLimit;\ndelete msg.statusCode;\ndelete msg.responseUrl;\ndelete msg.headers;\ndelete msg.httpAuthirozation;\ndelete msg.payload;\n\nreturn msg;",
                "name": "tdo ids to tdoData",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 148.5,
                "y": 511,
                "z": "2ae8386f.5eb628",
                "id": "1e09fb74.5c49d5",
                "drop": false,
                "name": "",
                "rate": "1",
                "type": "delay",
                "wires": [
                [
                    "33413944.c9c5c6"
                ]
                ],
                "timeout": "100",
                "pauseType": "delay",
                "rateUnits": "second",
                "randomLast": "5",
                "nbRateUnits": "1",
                "randomFirst": "1",
                "randomUnits": "seconds",
                "timeoutUnits": "milliseconds"
            },
            {
                "x": 393.5,
                "y": 452,
                "z": "2ae8386f.5eb628",
                "id": "6246656d.54640c",
                "func": "msg.payload = msg.searchQuery;\nmsg.payload.limit = msg.searchLimit;\nmsg.searchOffset += msg.searchLimit;\nmsg.payload.offset = msg.searchOffset;\n\nmsg.headers = {\n    ''Content-Type'': ''application/json'',\n    ''Authorization'': msg.httpAuthorization || msg.debugAuthorization\n};\n\nreturn msg;",
                "name": "prepare next page",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "1e09fb74.5c49d5"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 594.5,
                "y": 309,
                "z": "2ae8386f.5eb628",
                "id": "41a8d87c.8d47d8",
                "name": "200?",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "200",
                    "vt": "str"
                },
                {
                    "t": "else"
                }
                ],
                "wires": [
                [
                    "e03a0696.ed5c98"
                ],
                [
                    "66cde68a.dfc708"
                ]
                ],
                "repair": false,
                "outputs": 2,
                "checkall": "true",
                "property": "statusCode",
                "propertyType": "msg"
            },
            {
                "x": 775.5,
                "y": 311,
                "z": "2ae8386f.5eb628",
                "id": "66cde68a.dfc708",
                "func": "node.error(''http error status ${msg.statusCode} - ${JSON.stringify(msg.payload)}'', msg)\nreturn msg;",
                "name": "log error",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 1213,
                "y": 332,
                "z": "2dbe3ce9.b79b84",
                "id": "133bf7d.f66e708",
                "drop": false,
                "name": "Poll the API for Response (20s)",
                "rate": "1",
                "type": "delay",
                "wires": [
                [
                    "3086824b.2d282e",
                    "66e39093.010ab"
                ]
                ],
                "timeout": "20",
                "pauseType": "delay",
                "rateUnits": "second",
                "randomLast": "5",
                "nbRateUnits": "1",
                "randomFirst": "1",
                "randomUnits": "seconds",
                "timeoutUnits": "seconds"
            },
            {
                "x": 910,
                "y": 305,
                "z": "2dbe3ce9.b79b84",
                "id": "ffe2c52f.68a9c8",
                "name": "API Response?",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "complete",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "running",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "pending",
                    "vt": "str"
                }
                ],
                "wires": [
                [],
                [
                    "133bf7d.f66e708"
                ],
                [
                    "18628bce.4ebb04",
                    "133bf7d.f66e708"
                ]
                ],
                "repair": false,
                "outputs": 3,
                "checkall": "true",
                "property": "payload.job.status",
                "propertyType": "msg"
            },
            {
                "x": 1193.5,
                "y": 518,
                "z": "2dbe3ce9.b79b84",
                "id": "18628bce.4ebb04",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "false",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 1757,
                "y": 319,
                "z": "2dbe3ce9.b79b84",
                "id": "afeaddb.f22342",
                "func": "node.warn(\"Parent\")\n\nnode.warn(msg.payload)\nreturn msg;\n\n",
                "name": "Set Payload to Job Id",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 1529,
                "y": 198,
                "z": "2dbe3ce9.b79b84",
                "id": "1f56f21c.76638e",
                "func": "node.warn(\"Inside Sub Flow\")\nnode.warn(msg.payload)\n\nreturn msg;\n\n",
                "name": "Set Payload to Job Id",
                "type": "function",
                "noerr": 0,
                "wires": [
                []
                ],
                "outputs": 1
            },
            {
                "x": 1513.5,
                "y": 325,
                "z": "2dbe3ce9.b79b84",
                "id": "3086824b.2d282e",
                "to": "",
                "reg": false,
                "from": "",
                "name": "",
                "type": "change",
                "rules": [
                {
                    "p": "job.id",
                    "t": "set",
                    "pt": "msg",
                    "to": "payload",
                    "tot": "msg"
                }
                ],
                "wires": [
                [
                    "afeaddb.f22342"
                ]
                ],
                "action": "",
                "property": ""
            },
            {
                "x": 1437,
                "y": 423,
                "z": "2dbe3ce9.b79b84",
                "id": "66e39093.010ab",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 159,
                "y": 74,
                "z": "f5692b40.001e28",
                "id": "1c0ca52.863225b",
                "name": "Transcription",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"524c8084-3446-45de-a3c7-b02c6a2ee888\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 502,
                "y": 167,
                "z": "f5692b40.001e28",
                "id": "cfb03024.657fd",
                "name": "Get engine manifests per build",
                "type": "aiware",
                "wires": [
                [
                    "d062587.e06bca8"
                ],
                [
                    "ced62e18.f1df9",
                    "1b559baa.d33a14"
                ]
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "query engine {\n  engine(id: \"{{{ engineId }}}\") {\n    builds {\n      records {\n        manifest\n      }\n    }\n  }\n}"
            },
            {
                "x": 865,
                "y": 148,
                "z": "f5692b40.001e28",
                "id": "d062587.e06bca8",
                "func": "msg.payload.manifest = msg.payload.engine.builds.records[0].manifest;\nconsole.log(\"In manifest check\");\nreturn msg;",
                "name": "Get most recent build manifest",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "b8685cf7.b805"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 476,
                "y": 246,
                "z": "f5692b40.001e28",
                "id": "ced62e18.f1df9",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "payload",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 1204,
                "y": 112,
                "z": "f5692b40.001e28",
                "id": "b8685cf7.b805",
                "func": "const validMediaFormats = [\"audio/x-wav\", \"text/plain; charset=utf-8\", \"image/gif\", \"image/jpeg\", \"text/plain\", \"application/ttml+xml\", \"application/json\", \"application/pdf\", \"audio/mpeg\", \"audio/wav\", \"audio/mp4\", \"audio/flac\", \"video/mp4\", \"video/mpeg\", \"video/ogg\", \"video/quicktime\", \"video/webm\", \"video/x-m4v\", \"video/x-ms-wmv\", \"video/x-msvideo\"];\n\nfunction validURL(textval) {\n    var urlregex = /^(https?|ftp):\\/\\/([a-zA-Z0-9.-]+(:[a-zA-Z0-9.&%$-]+)*@)*((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]?)(\\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}|([a-zA-Z0-9-]+\\.)*[a-zA-Z0-9-]+\\.(com|edu|gov|int|mil|net|org|biz|arpa|info|name|pro|aero|coop|museum|[a-zA-Z]{2}))(:[0-9]+)*(\\/($|[a-zA-Z0-9.,?''\\\\+&%$#=~_-]+))*$/;\n    return urlregex.test(textval);\n}\n\nvar manifest = msg.payload.manifest;\n\n// check for engine id\nif (!manifest.hasOwnProperty(''engineId'')) {\n    msg.payload.error = \"Missing engine ID\";\n    return [null, msg];\n} \n\n// check for cluster size\nif (!manifest.hasOwnProperty(''clusterSize'')) {\n    msg.payload.error = \"Missing cluster size\";\n    return [null, msg];\n} else {\n    var clusterSize = manifest.clusterSize;\n    switch (clusterSize) {\n        case \"custom\":\n            if (!manifest.hasOwnProperty(''customProfile'')) {\n                msg.payload.error = \"No customProfile provided for custom cluster\";\n                return [null, msg];\n            }\n            break;\n        case \"xsmall\":\n        case \"small\":\n        case \"medium\":\n        case \"large\":\n        case \"xlarge\":\n            break;\n        default:\n            msg.payload.error = \"Invalid cluster size provided\";\n            return [null, msg];\n    }\n}\n\n// check for engine mode\nif (!manifest.hasOwnProperty(''engineMode'')) {\n    msg.payload.error = \"No engine mode set\";\n    return [null, msg];\n} else {\n    var engineMode = manifest.engineMode;\n    switch (engineMode) {\n        case \"legacy\":\n        case \"batch\":\n        case \"stream\":\n        case \"chunk\":\n            break;\n        default:\n            msg.payload.error = \"Invalid engine mode\"\n            return [null, msg];\n    }\n}\n// if a url is set make sure it is valid\nif (manifest.hasOwnProperty(''url'')) {\n    if (!validURL(manifest.url)) {\n        msg.payload.error = \"Invalid URL\";\n        return [null, msg];\n    }\n}\n// if external calls are set, make sure each is a valid url\nif (manifest.hasOwnProperty(''externalCalls'')) {\n    for (var url in manifest.externalCalls) {\n        if (!validURL(manifest.externalCalls[url])) {\n            msg.payload.error = \"Invalid URL in external calls list: \" + manifest.externalCalls[url];\n            return [null, msg];\n        }\n    }\n}\n\n// check media input and output formats\nif (!manifest.hasOwnProperty(''preferredInputFormat'')) {\n    msg.payload.error = \"Missing preferredInputFormat\";\n    return [null, msg];\n}\nvar match = false;\nfor (var format in validMediaFormats) {\n    if (validMediaFormats[format] === manifest.preferredInputFormat) {\n        match = true;\n        break\n    }\n}\nif (!match) {\n    msg.payload.error = \"Need a valid preferredInputFormat\";\n    return [null, msg];\n}\n\nfor (var format in manifest.supportedInputFormats) {\n    match = false\n    for (var known in validMediaFormats) {\n        if (manifest.supportedInputFormats[format] == validMediaFormats[known]) {\n            match = true;\n        }\n    }\n    if (!match) {\n        msg.payload.error = \"Unknown input media format: \" + manifest.supportedInputFormats[format];\n        return [null, msg];\n    }\n}\n\nif (!manifest.hasOwnProperty(''outputFormats'') || manifest.outputFormats.length === 0) {\n    msg.payload.error = \"Missing outputFormats\";\n} else {\n    for (var format in manifest.outputFormats) {\n        match = false;\n        for (var known in validMediaFormats) {\n            if (manifest.outputFormats[format] == validMediaFormats[known]) {\n                match = true;\n                break;\n            }\n        }\n        if (!match) {\n            msg.payload.error = \"Unknown output media format: \" + manifest.outputFormats[format];\n            return [null, msg];\n        }\n    }\n}\n\n// check concurrency settings\nif (manifest.hasOwnProperty(''initialConcurrency'') && manifest.initialConcurrency < 1) {\n    msg.paylod.error = \"Initial concurrency cannot be less than 1\";\n    return [null, msg];\n}\nif (manifest.hasOwnProperty(''maxConcurrency'') && manifest.maxConcurrency < 1) {\n    msg.payload.error = \"Max concurrency cannot be less than 1\";\n    return [null, msg];\n}\nif (manifest.hasOwnProperty(''initialConcurrency'') && manifest.hasOwnProperty(''maxConcurrency'') && manifest.maxConcurrency < manifest.initialConcurrency) {\n    msg.payload.error = \"Max concurrency cannot be lease than initial concurrency\";\n    return [null, msg];\n}\nif (manifest.hasOwnProperty(''maxMediaLengthMS'') && manifest.hasOwnProperty(''minMediaLengthMS'') && manifest.maxMediaLengthMS < manifest.minMediaLengthMS) {\n    msg.payload.error = \"Max media length cannot be less than minimum media length\";\n    return [null, msg];\n}\nmsg.payload.engineId = manifest.engineId\nreturn [msg, null];\n\n\n",
                "name": "Check manifest",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "3349c2bc.6ae17e"
                ],
                [
                    "e7d2b7a1.6f9fb8",
                    "609231ce.aef75"
                ]
                ],
                "outputs": 2
            },
            {
                "x": 920,
                "y": 100,
                "z": "f5692b40.001e28",
                "id": "8f1149f3.ceef88",
                "name": "Inject manifest",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "b8685cf7.b805"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"manifest\":{\"engineId\":\"d4f08894-0c20-4d1f-8e92-4758a791e4bc\",\"url\":\"www.google.com\",\"category\":\"Enter your engine category\",\"externalCalls\":[],\"preferredInputFormat\":\"application/json\",\"outputFormats\":[\"application/json\"],\"initialConcurrency\":50,\"clusterSize\":\"medium\",\"maxConcurrency\":50,\"supportedInputFormats\":[\"application/pdf\",\"text/plain\"],\"engineMode\":\"chunk\"}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 1205,
                "y": 178,
                "z": "f5692b40.001e28",
                "id": "e7d2b7a1.6f9fb8",
                "name": "Manifest check failed",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "payload",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 1534.5,
                "y": 106,
                "z": "f5692b40.001e28",
                "id": "3349c2bc.6ae17e",
                "name": "Get engine cognitive category & name",
                "type": "aiware",
                "wires": [
                [
                    "ebf97901.de86a8",
                    "76b59234.081d6c"
                ],
                [
                    "76b59234.081d6c",
                    "9ba3727b.c7958"
                ]
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "query engine {\n  engine(id: \"{{{ engineId }}}\") {\n    name\n    description\n    id\n    category {\n      name\n    }\n  }\n}"
            },
            {
                "x": 1508,
                "y": 179,
                "z": "f5692b40.001e28",
                "id": "76b59234.081d6c",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "payload",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 2190.5,
                "y": 99,
                "z": "f5692b40.001e28",
                "id": "2cdae6d3.204e8a",
                "name": "Check engine cognitive category",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "Transcription",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Translate",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Facial Detection",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Object Detection",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Sentiment",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Text Recognition",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Logo Recognition",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Keyword Extraction",
                    "vt": "str"
                }
                ],
                "wires": [
                [
                    "d1dad40c.b47858"
                ],
                [
                    "47e4e60e.495198"
                ],
                [
                    "e77054e2.b4eb78"
                ],
                [
                    "622d7986.1108b8"
                ],
                [
                    "b5d60261.61056"
                ],
                [
                    "55ab8032.bf74d"
                ],
                [
                    "397c6ca5.355e44"
                ],
                [
                    "fad0290d.34bdb8"
                ]
                ],
                "repair": false,
                "outputs": 8,
                "checkall": "true",
                "property": "payload.engine.category.name",
                "propertyType": "msg"
            },
            {
                "x": 2949.5,
                "y": 77,
                "z": "f5692b40.001e28",
                "id": "f00f4f54.d01dc",
                "func": "//initialize variables\nvar payload = JSON.parse(msg.payload)\nvar tdoId = payload.data.createJob.targetId;\nconst tasks = payload.data.createJob.tasks.records;\nlet myTask = {};\n\nfor (var t in tasks){\n    if(tasks[t].engine.id === msg.engineId){\n        node.warn(tasks[t].engine.name);\n        myTask = tasks[t];\n        var taskId = tasks[t].id;\n    }\n}\nmsg.payload = Object.assign({\n    tdoId: tdoId,\n    taskId: taskId\n});\nreturn msg;",
                "name": "Get task",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "d4209812.169ee8",
                    "cf6a5810.cc4b98"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 3217.5,
                "y": 76,
                "z": "f5692b40.001e28",
                "id": "d4209812.169ee8",
                "name": "Query task status",
                "type": "aiware",
                "wires": [
                [
                    "4aa686dd.c7e0e8",
                    "c3fed419.986498"
                ],
                [
                    "c3fed419.986498"
                ]
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "query task{\n  task(id: \"{{payload.taskId}}\"){\n    id\n    status\n    targetId\n    target{\n      source\n      organization{\n        name\n        id\n      }\n    }\n    createdDateTime\n    queuedDateTime\n    startedDateTime\n    completedDateTime\n    mediaLengthSec\n    engine{\n      name\n    }\n    output\n  }\n}"
            },
            {
                "x": 3111.5,
                "y": 273,
                "z": "f5692b40.001e28",
                "id": "4aa686dd.c7e0e8",
                "name": "Check task status",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "queued",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "running",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "pending",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "failed",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "aborted",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "complete",
                    "vt": "str"
                }
                ],
                "wires": [
                [
                    "af6bba64.2c6c38"
                ],
                [
                    "af6bba64.2c6c38"
                ],
                [
                    "af6bba64.2c6c38"
                ],
                [
                    "24beddce.4bf9a2"
                ],
                [
                    "24beddce.4bf9a2"
                ],
                [
                    "24beddce.4bf9a2"
                ]
                ],
                "repair": false,
                "outputs": 6,
                "checkall": "true",
                "property": "payload.task.status",
                "propertyType": "msg"
            },
            {
                "x": 3511.5,
                "y": 177,
                "z": "f5692b40.001e28",
                "id": "af6bba64.2c6c38",
                "drop": false,
                "name": "Keep polling 25s...",
                "rate": "1",
                "type": "delay",
                "wires": [
                [
                    "2e824d97.6f8572"
                ]
                ],
                "timeout": "25",
                "pauseType": "delay",
                "rateUnits": "second",
                "randomLast": "5",
                "nbRateUnits": "1",
                "randomFirst": "1",
                "randomUnits": "seconds",
                "timeoutUnits": "seconds"
            },
            {
                "x": 3745.5,
                "y": 177,
                "z": "f5692b40.001e28",
                "id": "2e824d97.6f8572",
                "func": "msg.payload.taskId = msg.payload.task.id\nreturn msg;",
                "name": "Save task id payload",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "d4209812.169ee8"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 3072.5,
                "y": 414,
                "z": "f5692b40.001e28",
                "id": "9783d42d.3d4268",
                "name": "Get asset",
                "type": "aiware",
                "wires": [
                [
                    "325b6aff.db77b6",
                    "fc9fd88b.3f9b48"
                ],
                [
                    "fc9fd88b.3f9b48"
                ]
                ],
                "format": "handlebars",
                "syntax": "mustache",
                "template": "query tdo{\n  temporalDataObject(id:\"{{task.targetId}}\"){\n    assets(assetType:\"vtn-standard\"){\n      records{\n        id\n        assetType\n      \tcreatedDateTime\n      \tjsondata\n      \tsignedUri\n      }\n    }\n    name\n  }\n}"
            },
            {
                "x": 3072,
                "y": 492,
                "z": "f5692b40.001e28",
                "id": "fc9fd88b.3f9b48",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 1864.5,
                "y": 100,
                "z": "f5692b40.001e28",
                "id": "ebf97901.de86a8",
                "func": "msg.url = \"https://api.veritone.com/v3/graphql\"\nmsg.headers = {\n    \"Authorization\": \"Bearer 27526e:de8f3a62ff9c4c128ccc98b9775fd5e54ba030121a984d0a9b93cd95ad11b3d7\"\n};\nmsg.category = msg.payload.engine.category.name;\nmsg.descript = msg.payload.engine.description;\nreturn msg;",
                "name": "Set url, headers, engine ID",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cdae6d3.204e8a"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2765.5,
                "y": 77,
                "z": "f5692b40.001e28",
                "id": "2cde9878.438648",
                "ret": "txt",
                "tls": "",
                "url": "",
                "name": "",
                "type": "http request",
                "wires": [
                [
                    "f00f4f54.d01dc",
                    "e5aeff4d.5937c"
                ]
                ],
                "method": "POST"
            },
            {
                "x": 2947,
                "y": 128,
                "z": "f5692b40.001e28",
                "id": "cf6a5810.cc4b98",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 1847.5,
                "y": 24,
                "z": "f5692b40.001e28",
                "id": "2dc4f19d.b2bb2e",
                "info": "",
                "name": "Set payload & headers",
                "type": "comment",
                "wires": []
            },
            {
                "x": 2759.5,
                "y": 272,
                "z": "f5692b40.001e28",
                "id": "e9b0a816.5330d8",
                "name": "Transcription",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114722_GE4FOM7tFM2BGO3\",\"status\":\"complete\",\"targetId\":\"761153409\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"Speechmatics - English (US) - V2F\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 3340,
                "y": 520,
                "z": "f5692b40.001e28",
                "id": "bf993cf8.1a75b",
                "func": "const veriJsonSchemas = require(''veritone-json-schemas'');\nvar validator;\nlet result = JSON.parse(msg.payload);\nvar verifiedResult;\nswitch (msg.category) {\n    case \"Transcription\":\n        result.schemaId = \"https://docs.veritone.com/schemas/vtn-standard/transcript.json\";\n        result.validationContracts = [''transcript''];\n        validator = veriJsonSchemas.VALIDATORS[''transcript''];\n        verifiedResult = validator(result);     \n        break;\n    case \"Translate\":\n        validator = veriJsonSchemas.VALIDATORS[''media-translated'']\n        verifiedResult = validator(result);\n        break;\n    case \"Face Detection\":\n    case \"Object Detection\":\n        validator = veriJsonSchemas.VALIDATORS[''object''];\n        verifiedResult = validator(result);\n        break;\n    case \"Sentiment\":\n        validator = veriJsonSchemas.VALIDATORS[''sentiment''];\n        verifiedResult = veriJsonSchemas.verifySentiment(result);\n        break;\n    case \"Entity Extraction\":\n        verifiedResult = veriJsonSchemas.verifyEntity(result);\n        break;\n    case \"Summary\":\n        validator = veriJsonSchemas.VALIDATORS[''summary''];\n        verifiedResult = validator(result);\n        break;\n    case \"Keyword Extraction\":\n        verifiedResult = veriJsonSchemas.verifyKeyword(result);\n        break;\n    case \"Language Identification\":\n        verifiedResult = veriJsonSchemas.verifyLanguage(result);\n        break;\n    default:\n        verifiedResult = veriJsonSchemas.verifyText(result);\n}\nmsg.payload = {\n    isValid: verifiedResult.valid\n};\nif (msg.payload.isValid) {\n    return [msg, null];\n} else {\n    return [null, msg];\n}\n\n\n\n",
                "name": "VTN conformity check",
                "type": "function-npm",
                "noerr": 0,
                "wires": [
                [
                    "614bf70a.5f9748",
                    "7ab6d8aa.054fa8"
                ],
                [
                    "a494dcc9.720a1"
                ]
                ],
                "outputs": 2
            },
            {
                "x": 3600,
                "y": 408,
                "z": "f5692b40.001e28",
                "id": "f2449948.e80888",
                "ret": "txt",
                "tls": "",
                "url": "",
                "name": "Get the contents of signedUri",
                "type": "http request",
                "wires": [
                [
                    "bf993cf8.1a75b",
                    "27a4b806.4ac898"
                ]
                ],
                "method": "GET"
            },
            {
                "x": 3308.5,
                "y": 408,
                "z": "f5692b40.001e28",
                "id": "325b6aff.db77b6",
                "func": "var lengthAssets = msg.payload.temporalDataObject.assets.records.length; \nvar url;\nif (lengthAssets > 1) {\n    for (var i = 0; i < lengthAssets; i++) {\n        if (msg.payload.temporalDataObject.assets.records[i].jsondata.sourceTaskId == msg.task.id) {\n            url = msg.payload.temporalDataObject.assets.records[i].signedUri;\n        }\n    }\n} else if (lengthAssets == 1) {\n    url = msg.payload.temporalDataObject.assets.records[0].signedUri;\n} else {\n    msg.payload.error = \"Missing vtn-standard asset\";\n    return [null, msg];\n}\nmsg.url = url;\nvar tdoName = msg.payload.temporalDataObject.name;\nvar tdoNameArr = tdoName.split(\" \");\ntdoNameArr = tdoNameArr.slice(0, -1)\nmsg.category = tdoNameArr.join(\" \");\nreturn [msg, null];",
                "name": "Save signedUri to url & category",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "f2449948.e80888"
                ],
                [
                    "ed48cf1a.8946c"
                ]
                ],
                "outputs": 2
            },
            {
                "x": 3350,
                "y": 580,
                "z": "f5692b40.001e28",
                "id": "a494dcc9.720a1",
                "name": "is not valid vtn standard",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "payload",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 153.5,
                "y": 26,
                "z": "f5692b40.001e28",
                "id": "89c79e3e.86fee",
                "info": "",
                "name": "Inject engine ID",
                "type": "comment",
                "wires": []
            },
            {
                "x": 150,
                "y": 114,
                "z": "f5692b40.001e28",
                "id": "76cb94b7.bab5fc",
                "name": "Translate",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"a8223b8a-db5e-4fa5-962f-87e0648c4fa5\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 169,
                "y": 153,
                "z": "f5692b40.001e28",
                "id": "ae90a0a3.8b1ac",
                "name": "Face Detection",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"2cac8eb8-b234-4289-a8fc-684cfa79d284\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 169,
                "y": 191,
                "z": "f5692b40.001e28",
                "id": "2657ddfc.f2b3f2",
                "name": "Object Detection",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"1b33cbdc-35cf-44bd-940d-caeb60793a8d\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 148,
                "y": 229,
                "z": "f5692b40.001e28",
                "id": "476f1fa0.08de3",
                "name": "Sentiment",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"b81274eb-265b-4f25-b6db-aecda1990397\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 166,
                "y": 264,
                "z": "f5692b40.001e28",
                "id": "90f689e4.0bff88",
                "name": "Entity extraction",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"1be11423-fbfc-4333-b792-dd57e6add7ef\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 2459,
                "y": 75,
                "z": "f5692b40.001e28",
                "id": "d1dad40c.b47858",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Transcription TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Transcription ",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2447,
                "y": 116,
                "z": "f5692b40.001e28",
                "id": "47e4e60e.495198",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Translate TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Translate ",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2469,
                "y": 158,
                "z": "f5692b40.001e28",
                "id": "e77054e2.b4eb78",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Face detection TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Face detection",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2480,
                "y": 198,
                "z": "f5692b40.001e28",
                "id": "622d7986.1108b8",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Object Detection TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Object detection",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2463,
                "y": 287,
                "z": "f5692b40.001e28",
                "id": "b5d60261.61056",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Sentiment TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Sentiment",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2471,
                "y": 327,
                "z": "f5692b40.001e28",
                "id": "2c23abf8.8553d4",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Entity Extraction TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Entity extraction",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2435,
                "y": 22,
                "z": "f5692b40.001e28",
                "id": "47689fbd.f38d1",
                "info": "",
                "name": "Run job",
                "type": "comment",
                "wires": []
            },
            {
                "x": 2480,
                "y": 242,
                "z": "f5692b40.001e28",
                "id": "397c6ca5.355e44",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Logo Rec TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Logo recognition",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2767,
                "y": 228,
                "z": "f5692b40.001e28",
                "id": "d72f9152.9f8b",
                "info": "",
                "name": "Inject sample payload",
                "type": "comment",
                "wires": []
            },
            {
                "x": 2749,
                "y": 311,
                "z": "f5692b40.001e28",
                "id": "c673b250.79fdc",
                "name": "Translate",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114825_GGt36T8KsPgLJii\",\"status\":\"complete\",\"targetId\":\"770002276\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"Translate - M - Spanish to English - V2F Batch\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 2767,
                "y": 348,
                "z": "f5692b40.001e28",
                "id": "b7dc5f4d.490d4",
                "name": "Face Detection",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114825_8ze7JI0bsRBX7IJ\",\"status\":\"complete\",\"targetId\":\"770011774\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"Face Detection - F - V2F\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 2769,
                "y": 384,
                "z": "f5692b40.001e28",
                "id": "a80a2bb3.a3f278",
                "name": "Object detection",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114825_JIofSTwxBjxyr3r\",\"status\":\"complete\",\"targetId\":\"770058752\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"Valossa Visual Object V2F\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 2746,
                "y": 456,
                "z": "f5692b40.001e28",
                "id": "978c3b11.1cf418",
                "name": "Sentiment",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114825_Psoz7BjY4GxptMN\",\"status\":\"complete\",\"targetId\":\"770059071\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"zacloud-sentiment-rt\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 2767,
                "y": 420,
                "z": "f5692b40.001e28",
                "id": "b291a71a.7cbf08",
                "name": "Logo recognition",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114825_3fA9x66OsyoEdPz\",\"status\":\"complete\",\"targetId\":\"770204639\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"Google - Logo - V2F\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 3854,
                "y": 408,
                "z": "f5692b40.001e28",
                "id": "27a4b806.4ac898",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 1867.5,
                "y": 167,
                "z": "f5692b40.001e28",
                "id": "29e8bf7a.91ed2",
                "info": "",
                "name": "* API key needs to be frequently updated",
                "type": "comment",
                "wires": []
            },
            {
                "x": 1204,
                "y": 22,
                "z": "f5692b40.001e28",
                "id": "ebee5fcb.58d0d",
                "info": "",
                "name": "Manifest check",
                "type": "comment",
                "wires": []
            },
            {
                "x": 3497.5,
                "y": 290,
                "z": "f5692b40.001e28",
                "id": "24beddce.4bf9a2",
                "func": "msg = msg.payload\nreturn msg;",
                "name": "Save task info to msg",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "9783d42d.3d4268"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 3449,
                "y": 82,
                "z": "f5692b40.001e28",
                "id": "c3fed419.986498",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "payload",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 3451,
                "y": 24,
                "z": "f5692b40.001e28",
                "id": "e56bdc04.71e0a",
                "info": "Uses veri-json-schemas npm package to validate engine output",
                "name": "VTN conformity check",
                "type": "comment",
                "wires": []
            },
            {
                "x": 174,
                "y": 418,
                "z": "f5692b40.001e28",
                "id": "7575aca8.4bf9e4",
                "name": "Logo Recognition",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"361ae32c-4937-4d4c-9865-466fd3424bf9\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 186,
                "y": 303,
                "z": "f5692b40.001e28",
                "id": "fcb9b0d9.52572",
                "name": "Language identification",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"9535cf64-53c0-4ef8-8313-eebb98caa8c7\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 173,
                "y": 343,
                "z": "f5692b40.001e28",
                "id": "f6d438fe.39ec78",
                "name": "Keyword extration",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"151c3728-8a3d-44da-acf3-e4734eefb81d\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 141,
                "y": 380,
                "z": "f5692b40.001e28",
                "id": "8a93e902.723468",
                "name": "Summary",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "cfb03024.657fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"engineId\":\"5c0d8043-c02f-49c8-b57b-97aff4be868d\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 2481,
                "y": 368,
                "z": "f5692b40.001e28",
                "id": "fad0290d.34bdb8",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Keyword Extraction TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Keyword Extraction",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2502,
                "y": 451,
                "z": "f5692b40.001e28",
                "id": "f5145b0a.ba31d8",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Language Identification TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Language Identification",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2453,
                "y": 409,
                "z": "f5692b40.001e28",
                "id": "b9b56d6d.287bf",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Summary TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Summary",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 1859.5,
                "y": 307,
                "z": "f5692b40.001e28",
                "id": "55ab8032.bf74d",
                "func": "let description = msg.descript.toLowerCase();\nif (description.includes(\"keyword\")) {\n    msg.category = \"Keyword Extraction\";\n} else if (description.includes(\"entity\") || description.includes(\"entities\")) {\n    msg.category = \"Entity Extraction\";\n} else if (description.includes(\"summary\")) {\n    msg.category = \"Summary\";\n} else if (description.includes(\"language\")) {\n    msg.category = \"Language Identification\";\n} else {\n    msg.category = \"Text Recognition\";\n}\nreturn msg;",
                "name": "If text rec, get more specific",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "980db2e8.8e45a"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2167.5,
                "y": 307,
                "z": "f5692b40.001e28",
                "id": "980db2e8.8e45a",
                "name": "More specific cog. category",
                "type": "switch",
                "rules": [
                {
                    "t": "eq",
                    "v": "Entity Extraction",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Keyword Extraction",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Summary",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Language Identification",
                    "vt": "str"
                },
                {
                    "t": "eq",
                    "v": "Text Recognition",
                    "vt": "str"
                }
                ],
                "wires": [
                [
                    "2c23abf8.8553d4"
                ],
                [
                    "fad0290d.34bdb8"
                ],
                [
                    "b9b56d6d.287bf"
                ],
                [
                    "f5145b0a.ba31d8"
                ],
                [
                    "288ff8c9.776888"
                ]
                ],
                "repair": false,
                "outputs": 5,
                "checkall": "true",
                "property": "category",
                "propertyType": "msg"
            },
            {
                "x": 1990,
                "y": 376,
                "z": "f5692b40.001e28",
                "id": "d4cd9033.02baa",
                "info": "Text recognition is broken up into different classes such as entity, keyword, etc. Oddly sentiment is its own class so we don''t have to include it here. It checks the description, hoping it has one. We need to do this because of the vtn conformity check, as these diff classes have diff checks.",
                "name": "* Hacky way to get text rec more specific for vtn conformity check",
                "type": "comment",
                "wires": []
            },
            {
                "x": 2501,
                "y": 497,
                "z": "f5692b40.001e28",
                "id": "288ff8c9.776888",
                "func": "var query = ''\nmutation createJob{\n  createJob(input: {\n    target:{\n      startDateTime:1548432520,\n      stopDateTime:1548436341,\n      name:\"Text Recognition TDO\"\n    },\n    tasks: [{\n         engineId:\"9e611ad7-2d3b-48f6-a51b-0a1ba40feab4\",\n         payload:{\n             url: \"'' + msg.testUrl + ''\"\n         }\n    },{\n      engineId: \"'' + msg.payload.engine.id + ''\"\n    }\n    ]\n  }) {\n    id\n    targetId\n    tasks{\n      records{\n        status\n        id\n        engine{\n          name\n          id\n        }\n      }\n    }\n  }\n}\n''\nmsg.payload = {\n    \"query\": query\n}\n\nreturn msg;",
                "name": "Text Recognition (Default)",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "2cde9878.438648"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 2755,
                "y": 492,
                "z": "f5692b40.001e28",
                "id": "192e25cb.bf380a",
                "name": "Entity extract",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114826_PBTpBbRfvlAYHg5\",\"status\":\"complete\",\"targetId\":\"770252899\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"zacloud-entity-extract-rt\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 2773,
                "y": 528,
                "z": "f5692b40.001e28",
                "id": "b4d77b0b.38a638",
                "name": "Lang identification",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114826_KkGQo8IosbTjTlh\",\"status\":\"complete\",\"targetId\":\"770257070\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"zacloud-language-detect-rt\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 2770,
                "y": 564,
                "z": "f5692b40.001e28",
                "id": "c7d1aed4.897bd",
                "name": "Keyword Extraction",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114826_hw8oBfFk7f0QTbj\",\"status\":\"complete\",\"targetId\":\"770267343\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"Machine Box Keyword - V2F\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 2737,
                "y": 600,
                "z": "f5692b40.001e28",
                "id": "227a5aa3.d6f336",
                "name": "Summary",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "4aa686dd.c7e0e8"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"task\":{\"id\":\"19114826_HgZFQNItdMSdNFQ\",\"status\":\"complete\",\"targetId\":\"770267558\",\"target\":{\"source\":null,\"organization\":{\"name\":\"Veritone, Inc.\",\"id\":\"7682\"}},\"createdDateTime\":\"2019-11-22T21:04:45.000Z\",\"queuedDateTime\":\"2019-11-22T21:04:52.000Z\",\"startedDateTime\":\"2019-11-22T21:05:17.000Z\",\"completedDateTime\":\"2019-11-22T21:16:54.000Z\",\"output\":{\"info\":\"\",\"error\":\"\",\"chunkCount\":\"1\",\"errorCount\":\"0\",\"failureRate\":\"0.000\",\"pausedCount\":\"0\",\"ignoredCount\":\"0\",\"successCount\":\"1\",\"filteredCount\":\"0\",\"noStatusCount\":\"0\",\"conductorStats\":\"\",\"invalidStatusCount\":\"0\"},\"engine\":{\"name\":\"zacloud-summary-rt\"}}}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 3620,
                "y": 500,
                "z": "f5692b40.001e28",
                "id": "614bf70a.5f9748",
                "name": "is valid vtn standard",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "payload",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 2792,
                "y": 146,
                "z": "f5692b40.001e28",
                "id": "e5aeff4d.5937c",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 500,
                "y": 380,
                "z": "f5692b40.001e28",
                "id": "3973f16.159950e",
                "url": "/ready",
                "name": "ready webhook",
                "type": "http in",
                "wires": [
                [
                    "a4d9ac46.9d6bb"
                ]
                ],
                "method": "get",
                "upload": false,
                "swaggerDoc": ""
            },
            {
                "x": 710.5,
                "y": 379.5,
                "z": "f5692b40.001e28",
                "id": "a4d9ac46.9d6bb",
                "name": "return",
                "type": "http response",
                "wires": [],
                "headers": {},
                "statusCode": "200"
            },
            {
                "x": 492,
                "y": 513,
                "z": "f5692b40.001e28",
                "id": "d1a8b8ed.fb47a8",
                "url": "/process",
                "name": "process webhook",
                "type": "http in",
                "wires": [
                [
                    "a5358263.7e7fd"
                ]
                ],
                "method": "post",
                "upload": false,
                "swaggerDoc": ""
            },
            {
                "x": 543,
                "y": 446,
                "z": "f5692b40.001e28",
                "id": "450caa61.b5fbd4",
                "name": "test payload",
                "once": false,
                "type": "inject",
                "topic": "",
                "wires": [
                [
                    "a5358263.7e7fd"
                ]
                ],
                "repeat": "",
                "crontab": "",
                "payload": "{\"type\":\"media_chunk\",\"timestampUTC\":1567708486736,\"taskId\":\"19093605_Xblangz4NiXyJ20\",\"tdoId\":\"650888889\",\"jobId\":\"19093605_Xblangz4Ni\",\"startOffsetMs\":0,\"endOffsetMs\":0,\"width\":230,\"height\":238,\"mimeType\":\"image/jpeg\",\"cacheURI\":\"https://fran-test-rt.s3.amazonaws.com/cbc_news.txt\",\"taskPayload\":{\"applicationId\":\"ed075985-bc94-406b-8639-44d1da42c3fb\",\"definitionId\":\"3019de97-1be1-48f6-a78e-a197d9b08b3f\",\"jobId\":\"19093605_Xblangz4Ni\",\"organizationId\":\"7682\",\"recordingId\":\"650888889\",\"engineId\":\"1be11423-fbfc-4333-b792-dd57e6add7ef\",\"taskId\":\"19093605_Xblangz4NiXyJ20\",\"token\":\"eyJhbGciOiJIUzI1NiJ9.dGVzdA.test_citest_placeholder_see_VE-22367\",\"veritoneApiBaseUrl\":\"https://api.veritone.com\"},\"chunkUUID\":\"583416a3-1381-4cc1-b1a0-3839c1f67ccd\"}",
                "onceDelay": 0.1,
                "payloadType": "json"
            },
            {
                "x": 719,
                "y": 513,
                "z": "f5692b40.001e28",
                "id": "a5358263.7e7fd",
                "func": "console.log(\"Validating event: \" + msg.event);\nmsg.event = msg.payload;\nif (msg.event.engineId === null || msg.event.engineId === \"\") {\n    return [null, msg];\n} else {\n    msg.testUrl = msg.event.cacheURI\n    msg.engineId = msg.event.taskPayload.engineId;\n    msg.token = msg.event.taskPayload.token;\n    return [msg, null];\n}\n",
                "name": "Validate event",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "cfb03024.657fd",
                    "c7abb7cc.423ad8"
                ],
                [
                    "5c26a133.cc8e5",
                    "c7abb7cc.423ad8"
                ]
                ],
                "outputs": 2
            },
            {
                "x": 880,
                "y": 600,
                "z": "f5692b40.001e28",
                "id": "5c26a133.cc8e5",
                "name": "Ignore",
                "type": "http response",
                "wires": [],
                "headers": {},
                "statusCode": "204"
            },
            {
                "x": 1010,
                "y": 520,
                "z": "f5692b40.001e28",
                "id": "c7abb7cc.423ad8",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 3610,
                "y": 540,
                "z": "f5692b40.001e28",
                "id": "7ab6d8aa.054fa8",
                "func": "var output = []\nvar obj1 = {\n    type: \"text\",\n    text: \"passed vtn conformity and manifest check\"\n};\noutput.push(obj1);\n//the msg.payload is what is used to create the V2F msg\nmsg.payload = Object.assign({\n    type: ''engine_output'',\n    outputType: ''object-text'',\n    mimeType: ''application/json'',\n    content: JSON.stringify({\n        output\n    }),\n    //version for Edge message (always leave as ''1'' value for now 2019-05)\n    rev: 1, \n    /*structure the outbound V2F event*/\n    /*The ''taskId'' and other variables come downstream from the Edge Messages messages*/\n    /* See Edge Messages Repo */\n}, context.global.lodash.pick(msg.event, [''taskId'', ''tdoId'', ''jobId'', ''startOffsetMs'', ''endOffsetMs'', ''taskPayload'', ''chunkUUID'']));\nreturn msg;\n",
                "name": "Transform to VTN",
                "type": "function",
                "noerr": 0,
                "wires": [
                [
                    "5c430e81.e18e5"
                ]
                ],
                "outputs": 1
            },
            {
                "x": 3810,
                "y": 540,
                "z": "f5692b40.001e28",
                "id": "5c430e81.e18e5",
                "name": "return VTN",
                "type": "http response",
                "wires": [],
                "headers": {},
                "statusCode": "200"
            },
            {
                "x": 3250,
                "y": 460,
                "z": "f5692b40.001e28",
                "id": "ed48cf1a.8946c",
                "name": "",
                "type": "debug",
                "wires": [],
                "active": true,
                "console": false,
                "complete": "true",
                "tostatus": false,
                "tosidebar": true
            },
            {
                "x": 730,
                "y": 240,
                "z": "f5692b40.001e28",
                "id": "1b559baa.d33a14",
                "name": "Error",
                "type": "http response",
                "wires": [],
                "headers": {},
                "statusCode": "500"
            },
            {
                "x": 1330,
                "y": 260,
                "z": "f5692b40.001e28",
                "id": "609231ce.aef75",
                "name": "Error",
                "type": "http response",
                "wires": [],
                "headers": {},
                "statusCode": "500"
            },
            {
                "x": 1730,
                "y": 220,
                "z": "f5692b40.001e28",
                "id": "9ba3727b.c7958",
                "name": "Error",
                "type": "http response",
                "wires": [],
                "headers": {},
                "statusCode": "500"
            }
            ],
            "package": {
            "bin": {
                "node-red": "./red.js",
                "node-red-pi": "bin/node-red-pi"
            },
            "main": "red/red.js",
            "name": "node-red",
            "engines": {
                "node": ">=4"
            },
            "license": "Apache-2.0",
            "scripts": {
                "test": "grunt",
                "build": "grunt build",
                "debug": "node --inspect-brk=28743 red.js -s config/service/settings.js",
                "start": "node red.js -s config/service/settings.js",
                "debugengine": "node --inspect-brk=28743 red.js -s config/engine/settings.js",
                "startengine": "node red.js -s config/engine/settings.js"
            },
            "version": "0.19.5",
            "homepage": "http://nodered.org",
            "keywords": [
                "editor",
                "messaging",
                "iot",
                "flow"
            ],
            "repository": {
                "url": "https://github.com/node-red/node-red.git",
                "type": "git"
            },
            "description": "A visual tool for wiring the Internet of Things",
            "contributors": [
                {
                "name": "Nick O''Leary"
                },
                {
                "name": "Dave Conway-Jones"
                }
            ],
            "dependencies": {
                "ws": "1.1.5",
                "ajv": "6.5.4",
                "cors": "2.8.4",
                "cron": "1.5.0",
                "docx": "^5.0.0-rc4",
                "mqtt": "2.18.8",
                "nopt": "4.0.1",
                "when": "3.7.8",
                "axios": "^0.18.1",
                "clone": "2.1.2",
                "cookie": "0.3.1",
                "denque": "1.3.0",
                "dotenv": "^6.2.0",
                "lodash": "^4.17.15",
                "multer": "1.4.1",
                "semver": "5.6.0",
                "xml2js": "0.4.19",
                "cheerio": "0.22.0",
                "express": "4.16.4",
                "i18next": "11.6.0",
                "is-utf8": "0.2.1",
                "js-yaml": "3.12.0",
                "jsonata": "1.5.4",
                "request": "2.88.0",
                "bcryptjs": "2.4.3",
                "fs-extra": "5.0.0",
                "hash-sum": "1.0.2",
                "mustache": "2.3.2",
                "passport": "0.4.0",
                "raw-body": "2.3.3",
                "fs.notify": "0.0.4",
                "sentiment": "2.1.0",
                "uglify-js": "3.4.9",
                "basic-auth": "2.0.1",
                "on-headers": "1.0.1",
                "body-parser": "1.18.3",
                "media-typer": "0.3.0",
                "memorystore": "1.6.0",
                "oauth2orize": "1.11.0",
                "cookie-parser": "1.4.3",
                "proccess-clips": "~1.0.0",
                "express-session": "1.15.6",
                "moment-timezone": "^0.5.26",
                "request-promise": "^4.2.4",
                "https-proxy-agent": "2.2.1",
                "node-red-node-aws": "^0.1.7",
                "node-red-node-rbe": "^0.2.5",
                "veritone-node-red": "git+https://github.com/veritone/veritone-node-red#master",
                "json-stringify-safe": "5.0.1",
                "node-red-contrib-s3": "~0.1.2",
                "node-red-node-email": "0.1.*",
                "node-red-contrib-aws": "~0.5.0",
                "node-red-node-twilio": "^0.1.0",
                "passport-http-bearer": "1.0.1",
                "node-red-contrib-sfmc": "~0.1.1",
                "node-red-contrib-sftp": "0.0.8",
                "node-red-node-twitter": "^1.1.5",
                "node-red-contrib-force": "0.0.8",
                "node-red-contrib-moment": "^3.0.3",
                "node-red-contrib-chartjs": "~0.4.1",
                "node-red-contrib-mongodb": "~0.3.4",
                "node-red-node-feedparser": "^0.1.12",
                "node-red-contrib-postgres": "~0.6.1",
                "node-red-contrib-mail-parse": "~0.1.5",
                "node-red-contrib-salesforce": "~0.5.1",
                "node-red-contrib-wait-paths": "^0.2.12",
                "node-red-contrib-file-upload": "0.0.5",
                "node-red-contrib-media-utils": "0.0.8",
                "node-red-contrib-pythonshell": "~1.5.4",
                "node-red-contrib-function-npm": "~0.2.0",
                "node-red-contrib-http-request": "~0.1.13",
                "node-red-contrib-viseo-ffmpeg": "~0.3.0",
                "node-red-contrib-http-multipart": "~0.3.2",
                "node-red-contrib-send-multipart": "~0.3.9",
                "passport-oauth2-client-password": "0.1.2",
                "node-red-contrib-viseo-salesforce": "~0.2.5",
                "node-red-contrib-postgres-variable": "0.0.11",
                "node-red-contrib-example-lower-case": "~1.0.0",
                "node-red-contrib-viseo-google-speech": "~1.4.0-alpha.0",
                "node-red-contrib-http-request-multipart": "~0.2.11",
                "node-red-contrib-viseo-google-authentication": "~0.1.1",
                "node-red-contrib-salesforce-connection-emitter": "~1.4.3"
            },
            "devDependencies": {
                "grunt": "^1.0.4",
                "mocha": "^5.2.0",
                "sinon": "1.17.7",
                "eslint": "^5.16.0",
                "should": "^8.4.0",
                "istanbul": "0.4.5",
                "grunt-cli": "~1.3.1",
                "stoppable": "^1.0.7",
                "supertest": "3.3.0",
                "grunt-sass": "~2.0.0",
                "http-proxy": "^1.18.0",
                "proxyquire": "^2.1.3",
                "grunt-chmod": "~1.1.1",
                "webdriverio": "^4.14.4",
                "chromedriver": "2.41.0",
                "grunt-nodemon": "~0.4.2",
                "grunt-jsonlint": "~1.1.0",
                "grunt-webdriver": "^2.0.3",
                "grunt-concurrent": "~2.3.1",
                "grunt-contrib-copy": "~1.0.0",
                "grunt-simple-mocha": "~0.4.1",
                "wdio-spec-reporter": "^0.1.5",
                "grunt-contrib-clean": "~1.1.0",
                "grunt-contrib-watch": "~1.1.0",
                "grunt-contrib-concat": "~1.0.1",
                "grunt-contrib-jshint": "~1.1.0",
                "grunt-contrib-uglify": "~3.4.0",
                "grunt-mocha-istanbul": "5.0.2",
                "wdio-mocha-framework": "^0.6.2",
                "grunt-contrib-compress": "~1.4.0",
                "node-red-node-test-helper": "0.1.7",
                "wdio-chromedriver-service": "^0.1.5"
            },
            "optionalDependencies": {
                "bcrypt": "~2.0.0"
            }
            }
        }
    }',
    false,
    '{
        "runtime": "nodeRed",
        "engineId": "270beec6-185b-4fd9-87f9-9699ff2af596",
        "engineMode": "chunk"
    }'
WHERE NOT EXISTS (SELECT 1 FROM job_new.build WHERE build_id = 'b3fed59d-fb01-40f6-9aa1-3f2867a23ab0'
    OR (engine_id = '270beec6-185b-4fd9-87f9-9699ff2af596' AND build_state = 'deployed'));
