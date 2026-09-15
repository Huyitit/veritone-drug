UPDATE workflow.workflow_runtime_storage SET storage_metadata = E'{
	"flowName": "Hello World",
	"version": "1",
	"edge": {},
	"nodeRed": {
		"flows": [{
				"id": "4750c0a7.16a39",
				"type": "tab",
				"label": "Hello World",
				"disabled": false,
				"info": "# Overview\\nA ''Hello World'' flow that introduces aiWARE specific features including the `api` node with a `GraphQL` query.\\n\\n### Details\\n- The flow starts with an `inject` node to start the flow\\n- We then make an API query and retrieves a list of users in the Veritone `Organization`\\n- the `function` node has a little bit of code that loops through the `list` of users and formats an HTML email\\n- We the send an email with the list of users!\\n\\n### Dependencies\\n* You will notice some flows will have a `Dependencies` section for things you will need to successfully run the flow\\n* In this case, all you need an Automate Studio account and to be logged in!"
			},
			{
				"id": "1c3aa259.ab934e",
				"type": "aiware",
				"z": "4750c0a7.16a39",
				"name": "getUsers",
				"format": "handlebars",
				"syntax": "mustache",
				"template": "query{\\n    users{\\n        records{\\n            id\\n            name\\n            firstName\\n            lastName\\n        }\\n    }\\n}",
				"x": 345,
				"y": 158,
				"wires": [
					[
						"ea23e387.53e54"
					],
					[]
				]
			},
			{
				"id": "f9da6913.e794b8",
				"type": "inject",
				"z": "4750c0a7.16a39",
				"name": "Start the flow!",
				"topic": "",
				"payload": "",
				"payloadType": "date",
				"repeat": "",
				"crontab": "",
				"once": false,
				"onceDelay": 0.1,
				"x": 143,
				"y": 157,
				"wires": [
					[
						"1c3aa259.ab934e"
					]
				]
			},
			{
				"id": "d0669ae8.df6188",
				"type": "e-mail",
				"z": "4750c0a7.16a39",
				"server": "smtp.mandrillapp.com",
				"port": "587",
				"secure": false,
				"name": "",
				"dname": "Send an Email!",
				"x": 800,
				"y": 218,
				"wires": []
			},
			{
				"id": "ea23e387.53e54",
				"type": "function",
				"z": "4750c0a7.16a39",
				"name": "make Table",
				"func": "/* Loop through the array of aiWARE \\nusers and create an HTML table */\\n\\nfunction makeTableHTML(myArray) {\\n    var result = \\"<table border=1><tr><th>Username</th></tr>\\";\\n    for(var i=0; i<myArray.length; i++) {\\n        result += \\"<tr><td>\\"+myArray[i].name+\\"</td></tr>\\";\\n    }\\n    result += \\"</table>\\";\\n\\n    return result;\\n}\\n\\nmsg.payload = makeTableHTML(msg.payload.users.records);\\n\\nreturn msg;",
				"outputs": 1,
				"noerr": 0,
				"x": 518,
				"y": 152,
				"wires": [
					[
						"24fd1a2.58f6fe6",
						"6bf49117.23a83"
					]
				]
			},
			{
				"id": "24fd1a2.58f6fe6",
				"type": "debug",
				"z": "4750c0a7.16a39",
				"name": "",
				"active": true,
				"tosidebar": true,
				"console": false,
				"tostatus": false,
				"complete": "false",
				"x": 543,
				"y": 94,
				"wires": []
			},
			{
				"id": "6bf49117.23a83",
				"type": "change",
				"z": "4750c0a7.16a39",
				"name": "set email variables",
				"rules": [{
						"t": "set",
						"p": "to",
						"pt": "msg",
						"to": "your email@emaildomain.com",
						"tot": "str"
					},
					{
						"t": "set",
						"p": "topic",
						"pt": "msg",
						"to": "Hello World, Automator!",
						"tot": "str"
					},
					{
						"t": "set",
						"p": "from",
						"pt": "msg",
						"to": "helloworld@veritone.com",
						"tot": "str"
					}
				],
				"action": "",
				"property": "",
				"from": "",
				"to": "",
				"reg": false,
				"x": 541,
				"y": 217,
				"wires": [
					[
						"d0669ae8.df6188"
					]
				]
			}
		]
	}
}'
WHERE workflow_runtime_id = 'defaultFlowTemplate';
