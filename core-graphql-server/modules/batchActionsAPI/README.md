# Batch Actions

Batch actions implementation capture the definition of a set of TDOs from a plain list or a TDO search query.

This list of TDO is added and related to a TDOBatch, it will have different mutators that can operate
on the list of TDOs. They'll have their own input and a new `batch process` will be created once a mutator gets executed.

### Rights to run Batch actions implementation
To perform batch actions, a user needs to belong to the organization and have the necessary rights.
```
['job:create', 'job:read', 'job:update', 'job:delete']
```
A super admin is able to retrieve a batch, batch process, and cancel a batch process.

### Status available for a TDOBatch
- **creating**: Apply for dynamic `batchSelector`. It's the initial status for an `createTDOBatch` mutator.
  The Batch information is returned but a process is still running asynchronously against the search server to get all the TDOs that match with the search query.
  The mutators attached to the batch cannot get executed until the TDO set is created.

- **created**: Apply for static and dynamic `batchSelector`. It's the final status for a `createTDOBatch` mutator.
  The mutators attached to batch will be able to get executed.

- **failed**: Apply for static and dynamic `batchSelector`. If the process of creating the TDO set fails during the search query against
  search server, the `batch` will not be able to be used and a new request must be executed.

## Creating a new batch of TDOs
As mentioned earlier, a batch can be created from the definition of a plain list or a TDO search query.

### Create a batch from a plain list
With a defined list of TDOs from input.

Note:

    - The list of TDOs must be included in `batchSelector` in the `tdoIds` field.
    - We can set the offset and limit of items to recover in `temporalDataObjects` and `temporalDataObjectsIds`. By default, `offset: 0` and `limit: 100`

#### Mutation
```angular2html
mutation createTDOBatch {
  createTDOBatch(input: {
    name: "my new batch"
    batchSelector: { 
        tdoIds: [
            "2750001378",
            "2750001376",
            "2750001374",
            "2750001373"
        ]
    }
    orgId: 7682
    createdBy: "rootUser"
  }) {
    id
    selectionCriteria
    isMutable
    temporalDataObjects(offset: 0, limit: 1){
        records{
         id
         name
        }
        count
        offset
        limit
    }
    temporalDataObjectsIds(offset: 0, limit: 2){
        records
        count
        offset
        limit
    }
  }
}
```
#### Response

Note:

    - `isMutable: false` is due to we already know the TDO set and it's saved before return response.
```angular2html
{
    "data": {
        "createTDOBatch": {
            "id": "e22960ed-5103-4a4e-83c1-c1ad4beebca7",
            "selectionCriteria": {
                "tdoIds": [
                    "2750001378",
                    "2750001376",
                    "2750001374",
                    "2750001373"
                ]
            },
            "isMutable": false,
            "temporalDataObjects": {
                "records": [
                    {
                        "id": "2750001378",
                        "name": "dev-wosu_MTWThSatSun_16_20PM"
                    }
                ],
                "count": 1,
                "offset": 0,
                "limit": 1
            },
            "temporalDataObjectsIds": {
                "records": [
                    "2750001378",
                    "2750001376"
                ],
                "count": 2,
                "offset": 0,
                "limit": 2
            }
        }
    }
}
```

### Create a batch with a dynamic search query

Note:

    - The search query must be included in `batchSelector` in the `searchQuery` field.
    - The search query may optionally include the variable `limit`. The maximum value possible is 200K, which is the maximum number of elements a batch can have.
    - The search query may optionally include the variable `offset`. By default its value is 0.
    - We can set the offset and limit of items to recover in `temporalDataObjects` and `temporalDataObjectsIds`. By default, `offset: 0` and `limit: 100`
    - skipTdosAfterEventCreation can be true to add a date filter to exclude tdos created after the event created timestamp 
    - Exists the possibility that the searchQuery collects too many tdos from the search server. So, as part of the sanity limit of tdo, a batch can contain a maximum number of 200K members (tdo)

#### Mutation
```angular2html
mutation createTDOBatch {
  createTDOBatch(input: {
    name: "my new batch"
    skipTdosAfterEventCreation: true
    batchSelector: { 
        searchQuery: {
            index: ["mine"],
            limit: 100,
            offset: 0, 
            query: {
                operator: "and",
                conditions: [
                    {
                        operator: "range",
                        field: "absoluteStartTimeMs", 
                        gte: "2023-07-22T00:00:01.000Z",
                        lte: "2023-07-23T02:00:00.000Z"  
                    },
                    {
                        operator: "query_string",
                        field: "transcript.transcript",
                        value:"\"npr\""
                    }
                ]
            },
            sort: [
                {
                    field: "recordingId",
                    order: "desc"
                }
            ]
        }
    } 
    orgId: 7682
    createdBy: "rootUser"
  }) {
    id
    selectionCriteria
    isMutable
    temporalDataObjects(limit: 1){
        records{
         id
         name
        }
        count
        offset
        limit
    }
    temporalDataObjectsIds(limit: 2){
        records
        count
        offset
        limit
    }
  }
}
```
#### Response

Note:

    - `isMutable: true` is due to the search query is an asynchronous process. It means that graphql server returns
    information related to the new batch but the process is still indexing the TDOs from the search server. When this process
    ends, the value will be `isMutable: false`.

    - `temporalDataObjects` and `temporalDataObjectsIds` are empty lists because we still do not know the set of TDOs.
````angular2html
{
    "data": {
        "createTDOBatch": {
            "id": "0e5d4a4c-4955-48e5-a4c1-7ef89daf0949",
            "selectionCriteria": {
                "searchQuery": {
                    "sort": [
                        {
                            "field": "recordingId",
                            "order": "desc"
                        }
                    ],
                    "index": [
                        "mine"
                    ],
                    "limit": 100,
                    "query": {
                        "operator": "and",
                        "conditions": [
                            {
                                "gte": "2023-07-22T00:00:01.000Z",
                                "lte": "2023-07-23T02:00:00.000Z",
                                "field": "absoluteStartTimeMs",
                                "operator": "range"
                            },
                            {
                                "field": "transcript.transcript",
                                "value": "\"npr\"",
                                "operator": "query_string"
                            }
                        ]
                    },
                    "offset": 0
                }
            },
            "isMutable": true,
            "temporalDataObjects": {
                "records": [],
                "count": 0,
                "offset": 0,
                "limit": 1
            },
            "temporalDataObjectsIds": {
                "records": [],
                "count": 0,
                "offset": 0,
                "limit": 2
            }
        }
    }
}
````

Note: `searchQuery` and `tdoIds` are mutually exclusive fields!

### Search a batch
If a batch was created previously, it's possible to get its information using `TDOBatch` query.

#### Query
```angular2html
query TDOBatch {
  TDOBatch(id: "17f32863-a791-4721-91ea-e1e0f4cf8a83") {
    id
    selectionCriteria
    isMutable
    temporalDataObjects(offset: 0, limit: 1){
        records{
         id
         name
        }
        count
        offset
        limit
    }
    temporalDataObjectsIds(offset: 0, limit: 2){
        records
        count
        offset
        limit
    }
  }
}
```
#### Response
```angular2html
{
    "data": {
        "TDOBatch": {
            "id": "17f32863-a791-4721-91ea-e1e0f4cf8a83",
            "selectionCriteria": {
                "tdoIds": [
                    "2750001378",
                    "2750001376",
                    "2750001374",
                    "2750001373"
                ]
            },
            "isMutable": false,
            "temporalDataObjects": {
                "records": [
                    {
                        "id": "2750001378",
                        "name": "dev-wosu_MTWThSatSun_16_20PM"
                    }
                ],
                "count": 1,
                "offset": 0,
                "limit": 1
            },
            "temporalDataObjectsIds": {
                "records": [
                    "2750001378",
                    "2750001376"
                ],
                "count": 2,
                "offset": 0,
                "limit": 2
            }
        }
    }
}
```
Note:

    - if `isMutable` is true then batch status is `creating`, otherwise it will be 'created'

if we try to get a nonexistent batch the response will be an error.
```angular2html
"message": "batchId not exists"
```

### Mutators in `TDOBatch`
They can operate on the list of tdos

### Status available for a mutator (batch process) in `TDOBatch`
- **creating**: Apply for dynamic `batchSelector`. At this point, a process is running against search server to get all the TDOs that match with the search query.
  The mutator will not be able to get executed until the TDO set is created.

- **pending**: Apply for static and dynamic `batchSelector`. It means the TDO set (Batch) was created and the `batch process` for mutator
  will be triggered soon. It also applies if batch already exists from a previous execution, pending status indicates mutator will be triggered.

- **running**: Apply for static and dynamic `batchSelector`. The mutator has been triggered, and one action for each member of the batch is being executed.

- **completed**: Apply for static and dynamic `batchSelector`. Once actions for each TDO finish and confirm its final status, the number of actions running must be zero.

- **canceling**: Apply for static and dynamic `batchSelector`. It's possible to interrupt a `batch process` execution for
  a set of TDOs. This status means that a request to stop a `batch process` execution was sent, no more actions will be executed over the remainder TDOs.

- **canceled**: apply for static and dynamic `batchSelector`. Once the last of the running actions executed before the canceling request get aborted, the batch
  process actions ends completely.

- **aborted**: apply for static and dynamic `batchSelector`. If something fails during the process, an aborted status will be
  set for the `batch process`, not more TDOs will be taken to be processed and those who are running will be updated with status `aborted`.
  A new execution of the batch process will be necessary to run again all the TDO set.

- **failed**: apply for dynamic `batchSelector`. If the process of creation a Batch fails during the search query against
  search server, the `batch process` attached that is waiting for the new batch will be descanted because it's not possible
  to run over a set of TDO that was not created successfully. It will be necessary to create a new process for creating a batch

### Create a batch process

#### executeJobTemplate:
Runs a job defined by the input, for every tdo in the set. It may be triggered optionally at the time of batch creation..
The response type `TDOBatchJobProcess` will contain information like its id, status, status counting for action executions and the TDOBatch attached to the mutator.

It can be created at the moment of a batch creation, adding as input the batch process mutator with its own input.

#### Mutation with dynamic `batchSelector`
```angular2html
mutation createTDOBatch {
  createTDOBatch(input: {
    name: "my new batch"
    batchSelector: { 
        searchQuery: {
            index: ["mine"],
            limit: 100,
            offset: 0, 
            query: {
                operator: "and",
                conditions: [
                    {
                        operator: "range",
                        field: "absoluteStartTimeMs", 
                        gte: "2023-07-22T00:00:01.000Z",
                        lte: "2023-07-23T02:00:00.000Z"  
                    },
                    {
                        operator: "query_string",
                        field: "transcript.transcript",
                        value:"\"npr\""
                    }
                ]
            },
            sort: [
                {
                    field: "recordingId",
                    order: "desc"
                }
            ]
        }
    } 
    orgId: 7682
    createdBy: "rootUser"
  }) {
    id
    selectionCriteria
    isMutable
    temporalDataObjects(limit: 1){
        records{
         id
         name
        }
        count
        offset
        limit
    }
    temporalDataObjectsIds(limit: 2){
        records
        count
        offset
        limit
    }
    executeJobTemplate(input: {
      concurrency: 100
      processDefinition: {    
          dagTemplateId: "85f68719-44f8-440b-a6aa-b1740ca2f282",
          clusterId: "rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273"
       }
    }){
        id
        status
        concurrency
        itemsCompleted
        itemsFailed
        itemsTotal
        itemsRunning
        itemsPending
        details
      }
    }
}

```
#### Response
```angular2html
{
    "data": {
        "createTDOBatch": {
            "id": "792b6f59-0177-4e79-a00c-4ef1ea4ae0ac",
            "selectionCriteria": {
                "searchQuery": {
                    "sort": [
                        {
                            "field": "recordingId",
                            "order": "desc"
                        }
                    ],
                    "index": [
                        "mine"
                    ],
                    "limit": 100,
                    "query": {
                        "operator": "and",
                        "conditions": [
                            {
                                "gte": "2023-07-22T00:00:01.000Z",
                                "lte": "2023-07-23T02:00:00.000Z",
                                "field": "absoluteStartTimeMs",
                                "operator": "range"
                            },
                            {
                                "field": "transcript.transcript",
                                "value": "\"npr\"",
                                "operator": "query_string"
                            }
                        ]
                    },
                    "offset": 0
                }
            },
            "isMutable": true,
            "temporalDataObjects": {
                "records": [],
                "count": 0,
                "offset": 0,
                "limit": 1
            },
            "temporalDataObjectsIds": {
                "records": [],
                "count": 0,
                "offset": 0,
                "limit": 2
            },
            "executeJobTemplate": {
                "id": "e88f9e21-783f-4e99-87fb-185d023654c9",
                "status": "creating",
                "concurrency": 100,
                "itemsCompleted": 0,
                "itemsFailed": 0,
                "itemsTotal": 0,
                "itemsRunning": 0,
                "itemsPending": 0,
                "details": {
                    "batchId": "1cb5f971-f410-44cb-a331-2ebed33024ed"
                }
            }
        }
    }
}
```
note the new field `executeJobTemplate` in response. It contains information related to the new batch process.
Its status is true and counting fields are zero because the set of TDO is still in a creating process ("isMutable": true).

The field `concurrency` indicates the number of actions that can be running at the same time once the batch process gets triggered,
by default 100.

The field `processDefinition` has fields `dagTemplateId` and `clusterId` that are mandatory.

#### Mutation with static `batchSelector`
```angular2html
mutation createTDOBatch {
  createTDOBatch(input: {
    name: "my new batch"
    batchSelector: { 
        tdoIds: [
                    "2750001378",
                    "2750001376",
                    "2750001374",
                    "2750001373"
        ]
    }
    orgId: 7682
    createdBy: "rootUser"
  }) {
    id
    selectionCriteria
    isMutable
    temporalDataObjects(limit: 1){
        records{
         id
         name
        }
        count
        offset
        limit
    }
    temporalDataObjectsIds(limit: 2){
        records
        count
        offset
        limit
    }
    executeJobTemplate(input: {
      concurrency: 100
      processDefinition: {    
          dagTemplateId: "85f68719-44f8-440b-a6aa-b1740ca2f282",
          clusterId: "rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273"
       }
    }){
        id
        status
        concurrency
        itemsCompleted
        itemsFailed
        itemsTotal
        itemsRunning
        itemsPending
        details
      }
    }
}
```
#### Response
```angular2html
{
    "data": {
        "createTDOBatch": {
            "id": "1cb5f971-f410-44cb-a331-2ebed33024ed",
            "selectionCriteria": {
                "tdoIds": [
                    "2750001378",
                    "2750001376",
                    "2750001374",
                    "2750001373"
                ]
            },
            "isMutable": false,
            "temporalDataObjects": {
                "records": [
                    {
                        "id": "2750001378",
                        "name": "dev-wosu_MTWThSatSun_16_20PM"
                    }
                ],
                "count": 1,
                "offset": 0,
                "limit": 1
            },
            "temporalDataObjectsIds": {
                "records": [
                    "2750001378",
                    "2750001376"
                ],
                "count": 2,
                "offset": 0,
                "limit": 2
            },
            "executeJobTemplate": {
                "id": "0cd4b551-d885-4bc0-ba7c-635f75345549",
                "status": "pending",
                "concurrency": 100,
                "itemsCompleted": 0,
                "itemsFailed": 0,
                "itemsTotal": 4,
                "itemsRunning": 0,
                "itemsPending": 4,
                "details": {
                    "batchId": "1cb5f971-f410-44cb-a331-2ebed33024ed"
                }
            }
        }
    }
}
```
Note the difference in the field counting and status. This is due to we already know the number of TDOs to be processed.
They are pending to be executed, and it will be done automatically as soon as the order arrives at the eventing service.

### Create a batch process using `TDOBatch` query
As mentioned earlier, with `TDOBatch` query is possible to get information related to an existing batch, but this query
also works for creating a new `batch process` if, at the moment of creating the batch (`createTDOBatch`), the mutation was not added.

Otherwise, if when the batch was created it had attached the mutation in its input, then the request to `TDOBatch` is going to be used
to run again the pre-existing batch process. Note that to run again an existing batch process, its status must be `completed`, `aborted` or `canceled`
With other status, an error will be the response.

About the input param `concurrency`, it indicate the maximum amount of actions that can be running at the same time.
Each time once action ends and releases spaces, a new action is executed to get again the maximum amount of actions running concurrently.

If the batch process is being rerunning, its values `concurrency` and `processDefinition` can be changed and to keep tracking 
who made the changes, the value `modifiedBy` can be added inside `executeJobTemplate` input

#### Query
```angular2html
query TDOBatch {
  TDOBatch(id: "24df2b12-b09e-4f62-a598-f278f6bf1fbf") {
    id
    selectionCriteria
    isMutable
    temporalDataObjects(limit: 1){
        records{
         id
         name
        }
        count
        offset
        limit
    }
    temporalDataObjectsIds(limit: 2){
        records
        count
        offset
        limit
    }
    executeJobTemplate(input: {
      modifiedBy: "other user"
      concurrency: 100
      processDefinition: {    
          dagTemplateId: "85f68719-44f8-440b-a6aa-b1740ca2f282",
          clusterId: "rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273"
       }
    }){
        id
        status
        concurrency
        itemsCompleted
        itemsFailed
        itemsTotal
        itemsRunning
        itemsPending
        details
     }
    }
}
```
#### Response
```angular2html
{
    "data": {
        "TDOBatch": {
            "id": "24df2b12-b09e-4f62-a598-f278f6bf1fbf",
            "selectionCriteria": {
                "tdoIds": [
                    "2750001378",
                    "2750001376",
                    "2750001374",
                    "2750001373"
                ]
            },
            "isMutable": false,
            "temporalDataObjects": {
                "records": [
                    {
                        "id": "2750001378",
                        "name": "dev-wosu_MTWThSatSun_16_20PM"
                    }
                ],
                "count": 1,
                "offset": 0,
                "limit": 1
            },
            "temporalDataObjectsIds": {
                "records": [
                    "2750001378",
                    "2750001376"
                ],
                "count": 2,
                "offset": 0,
                "limit": 2
            },
            "executeJobTemplate": {
                "id": "8b3c6651-22d7-43fc-88f0-8e2e26b2f303",
                "status": "pending",
                "concurrency": 100,
                "itemsCompleted": 0,
                "itemsFailed": 0,
                "itemsTotal": 4,
                "itemsRunning": 0,
                "itemsPending": 4,
                "details": {
                    "batchId": "24df2b12-b09e-4f62-a598-f278f6bf1fbf"
                }
            }
        }
    }
}
```

If we try to run again the `TDOBatch`, we will receive an error message because the batch process is already running

```angular2html
"message": "batchProcess need to be with status 'completed', 'canceled' or 'aborted'.\n
batchProcess with id 8b3c6651-22d7-43fc-88f0-8e2e26b2f303 has status 'running'",
```

### Search a batch process

it's possible to get an existing batch process using `TDOBatchProcesses` query and as input its Id, or and Id of a
member (tdo) of the batch.

Exists a dateTimeFilter with possibles values like `dateModified` or `dateCreated`, an orderBy
with possible field values like `dateModified` or `dateCreated` and direction `asc` or `desc`.

finally, it's possible to limit the list result by offset or limit, by default 0 and 100 respectively.

#### Query
```angular2html
query TDOBatchProcesses {
  TDOBatchProcesses(input: {
    id: "e88f9e21-783f-4e99-87fb-185d023654c9"
    #tdoId: "2500004286"
    status: completed
    orderBy: {
        #field:dateModified
        field:dateCreated
        #direction: asc
        direction: desc
    }
    dateTimeFilter: {
        #field: dateModified,
        field: dateCreated,
        fromDateTime: "2020-05-30T16:40:03.789Z"
        toDateTime: "2024-08-29T18:40:03.789Z"
    }
    limit: 2
    offset: 0
  })
  {
      id
      status
      details
      concurrency
      itemsCompleted
      itemsFailed
      itemsTotal
      itemsRunning
      itemsPending
      TDOBatch{
        id
        isMutable
        temporalDataObjects(limit: 1){
            records{
            id
            name
            }
            count
            offset
            limit
        }
        temporalDataObjectsIds(limit: 2){
            records
            count
            offset
            limit
        }
      }
      actions(
        offset:0, 
        limit:2, 
        status: complete,
        orderBy: {
          #field:dateModified
          field:dateCreated
          #direction: asc
          direction: desc
        }){
          records{
              targetId
              actionId
              status
              details
          }
          offset
          limit
          count
        }
  }
}
```
we can trigger the queries `TDOBatch` and `actions` from `TDOBatchProcesses`. Below we explain each one

- With `TDOBatch` we can get the batch related to the bacth process with its attributes like id, selectionCriteria, isMutable, etc.

- With 'actions' is possible to get a list of jobs and their tdos related to the batch process execution. It's possible
  to filter by job status and by default, offset and limit will have values 0 and 30 respectively.
  Exists an orderBy with possible field values like `dateModified` or `dateCreated` and direction `asc` or `desc`.
  With this query is possible to calculate the total number of jobs in the batch process with a specific status.

- If you don't want to calculate the number of jobs/actions using the `actions` query, the `TDOBatchProcesses` returns in
  itemsCompleted, itemsFailed, itemsTotal, itemsRunning and itemsPending fields the jobs with that status at the moment of query execution,
  it means a counting in real time.

#### Response
```angular2html
{
    "data": {
        "TDOBatchProcesses": [
            {
                "id": "e88f9e21-783f-4e99-87fb-185d023654c9",
                "status": "completed",
                "details": {
                    "batchId": "792b6f59-0177-4e79-a00c-4ef1ea4ae0ac"
                },
                "concurrency": 100,
                "itemsCompleted": 29,
                "itemsFailed": 38,
                "itemsTotal": 67,
                "itemsRunning": 0,
                "itemsPending": 0,
                "TDOBatch": {
                    "id": "792b6f59-0177-4e79-a00c-4ef1ea4ae0ac",
                    "isMutable": false,
                    "selectionCriteria": {
                        "searchQuery": {
                            "sort": [
                                {
                                    "field": "recordingId",
                                    "order": "desc"
                                }
                            ],
                            "index": [
                                "mine"
                            ],
                            "limit": 100,
                            "query": {
                                "operator": "and",
                                "conditions": [
                                    {
                                        "gte": "2023-07-22T00:00:01.000Z",
                                        "lte": "2023-07-23T02:00:00.000Z",
                                        "field": "absoluteStartTimeMs",
                                        "operator": "range"
                                    },
                                    {
                                        "field": "transcript.transcript",
                                        "value": "\"npr\"",
                                        "operator": "query_string"
                                    }
                                ]
                            },
                            "offset": 0
                        }
                    },
                    "temporalDataObjects": {
                        "records": [
                            {
                                "id": "2670002782",
                                "name": "dev-wosu_MTWThSatSun_20_2359PM"
                            }
                        ],
                        "count": 1,
                        "offset": 0,
                        "limit": 1
                    },
                    "temporalDataObjectsIds": {
                        "records": [
                            "2670002782",
                            "2670002779"
                        ],
                        "count": 2,
                        "offset": 0,
                        "limit": 2
                    }
                },
                "actions": {
                    "records": [
                        {
                            "targetId": "2670002744",
                            "actionId": "23093821_Etsrmj292N",
                            "status": "failed",
                            "details": {
                                "clusterId": "rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273",
                                "jobConfig": {
                                    "routes": [],
                                    "authData": {
                                        "debug": {
                                            "tokenType": "apikey",
                                            "application": null,
                                            "_applicationId": null
                                        },
                                        "applicationId": ""
                                    },
                                    "isReprocessJob": false
                                }
                            },
                            "job": {
                                "id": "23093821_Etsrmj292N",
                                "name": null,
                                "status": "accepted"
                            },
                            "temporalDataObject": {
                                "id": "2670002744",
                                "organizationId": "7682",
                                "name": "dev-wosu_MTWThSatSun_12_16PM",
                                "status": "recorded"
                            }
                        },
                        {
                            "targetId": "2670002743",
                            "actionId": "23093821_hqKFzVD6vL",
                            "status": "failed",
                            "details": {
                                "clusterId": "rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273",
                                "jobConfig": {
                                    "routes": [],
                                    "authData": {
                                        "debug": {
                                            "tokenType": "apikey",
                                            "application": null,
                                            "_applicationId": null
                                        },
                                        "applicationId": ""
                                    },
                                    "isReprocessJob": false
                                }
                            },
                            "job": {
                                "id": "23093821_hqKFzVD6vL",
                                "name": null
                            },
                            "temporalDataObject": {
                                "id": "2670002743",
                                "organizationId": "7682",
                                "name": "dev-wosu_MTWThSatSun_12_16PM",
                                "status": "recorded"
                            }
                        }
                    ],
                    "offset": 0,
                    "limit": 2,
                    "count": 2
                }
            }
        ]
    }
}
```
### Canceling a batch process

With mutation `cancelTDOBatchProcess` we can cancel a batch process, from the cancel request further execution of the items in the batch will not be executed.
When the actions executed previously to the cancel request end their process and there are no more jobs running, then the final status
for the batch process will be `canceled`.

To cancel a batch process is mandatory that the current status for it must be `creating` or `running`. Otherwise,
an error message will be the response

```angular2html
"message": "batchProcessId needs to be in status 'creating' or 'running' before to cancel the process. Current status: canceling"
```
### mutation
```angular2html
mutation cancelTDOBatchProcess {
  cancelTDOBatchProcess(id: "8b3c6651-22d7-43fc-88f0-8e2e26b2f303") {
      id
      status
      details
      concurrency
      itemsCompleted
      itemsFailed
      itemsTotal
      itemsRunning
      itemsPending
      TDOBatch{
        id
        isMutable
        selectionCriteria
        temporalDataObjects(limit: 1){
            records{
            id
            name
            }
            count
            offset
            limit
        }
        temporalDataObjectsIds(limit: 2){
            records
            count
            offset
            limit
        }
      }
      actions(offset:0, limit:2, status: failed){
          records{
              targetId
              actionId
              status
              details
              job{
                  id
                  name
                  status
              }
              temporalDataObject{
                  id
                  organizationId
                  name
                  status
              }
          }
          offset
          limit
          count
        }
    }
}
```

#### Response
```angular2html
{
    "data": {
        "cancelTDOBatchProcess": {
            "id": "8b3c6651-22d7-43fc-88f0-8e2e26b2f303",
            "status": "canceling",
            "details": {
                "batchId": "24df2b12-b09e-4f62-a598-f278f6bf1fbf"
            },
            "concurrency": 100,
            "itemsCompleted": 0,
            "itemsFailed": 0,
            "itemsTotal": 4,
            "itemsRunning": 4,
            "itemsPending": 0,
            "TDOBatch": {
                "id": "24df2b12-b09e-4f62-a598-f278f6bf1fbf",
                "isMutable": false,
                "selectionCriteria": {
                    "tdoIds": [
                        "2750001378",
                        "2750001376",
                        "2750001374",
                        "2750001373"
                    ]
                },
                "temporalDataObjects": {
                    "records": [
                        {
                            "id": "2750001378",
                            "name": "dev-wosu_MTWThSatSun_16_20PM"
                        }
                    ],
                    "count": 1,
                    "offset": 0,
                    "limit": 1
                },
                "temporalDataObjectsIds": {
                    "records": [
                        "2750001378",
                        "2750001376"
                    ],
                    "count": 2,
                    "offset": 0,
                    "limit": 2
                }
            },
            "actions": {
                "records": [],
                "offset": 0,
                "limit": 2,
                "count": 0
            }
        }
    }
}
```

When the four jobs running ends, the final status will be `canceled`. We can check it with `TDOBatchProcesses`

```angular2html
{
    "data": {
        "TDOBatchProcesses": [
            {
                "id": "8b3c6651-22d7-43fc-88f0-8e2e26b2f303",
                "status": "canceled",
                "details": {
                    "batchId": "24df2b12-b09e-4f62-a598-f278f6bf1fbf"
                },
                "concurrency": 100,
                "itemsCompleted": 3,
                "itemsFailed": 1,
                "itemsTotal": 4,
                "itemsRunning": 0,
                "itemsPending": 0,
                "TDOBatch": {
                    "id": "24df2b12-b09e-4f62-a598-f278f6bf1fbf",
                    "isMutable": false,
                    "selectionCriteria": {
                        "tdoIds": [
                            "2750001378",
                            "2750001376",
                            "2750001374",
                            "2750001373"
                        ]
                    },
                    "temporalDataObjects": {
                        "records": [
                            {
                                "id": "2750001378",
                                "name": "dev-wosu_MTWThSatSun_16_20PM"
                            }
                        ],
                        "count": 1,
                        "offset": 0,
                        "limit": 1
                    },
                    "temporalDataObjectsIds": {
                        "records": [
                            "2750001378",
                            "2750001376"
                        ],
                        "count": 2,
                        "offset": 0,
                        "limit": 2
                    }
                },
                "actions": {
                    "records": [
                        {
                            "targetId": "2750001378",
                            "actionId": "23093821_9wnYhlvp1c",
                            "status": "failed",
                            "details": {
                                "clusterId": "rt-9d7a5d1b-ffe0-4d71-a982-190522cdf273",
                                "jobConfig": {
                                    "routes": [],
                                    "authData": {
                                        "debug": {
                                            "tokenType": "apikey",
                                            "application": null,
                                            "_applicationId": null
                                        },
                                        "applicationId": ""
                                    },
                                    "isReprocessJob": false
                                }
                            },
                            "job": {
                                "id": "23093821_9wnYhlvp1c",
                                "name": null
                            },
                            "temporalDataObject": {
                                "id": "2750001378",
                                "organizationId": "7682",
                                "name": "dev-wosu_MTWThSatSun_16_20PM",
                                "status": "recorded"
                            }
                        }
                    ],
                    "offset": 0,
                    "limit": 2,
                    "count": 1
                }
            }
        ]
    }
}
```
