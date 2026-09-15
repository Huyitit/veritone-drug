## Sample queries

Some of these may be out of date. See the tests in `test` for more working
examples.

### Get a recording (or "asset container") with most fields included

```
assetContainer(id: "21098441") {
  	id
	createdDateTime

    cloneData {
      originalId
      cloneBlobs
      assetIdMap {
        newAssetId
        oldAssetId
      }
    }
    programData {
      programLiveImage
    }
    recordingData {
      status
      applicationId
      startDateTime
      stopDateTime
    }
    fileData {
      fileName
      mimeType
      size
    }
	}
}

```

Returns something like this:

```
{
  "data": {
    "asset_container": {
      "id": "21098190",
      "createdDateTime": "1476726655",
      "programData": {
          "programId": "-1",
          "programLiveImage": "https://s3.amazonaws.com/dev-veritone-ugc/demo_temp%2FprogramImageURL%2FaQQwijynRgWgspiIvB94_THOM.jpg"
        },
    "cloneData" {
          "originalId": "16336241",
          "cloneBlobs": false,
          "assetIdMap": [
            {
              "oldAssetId": "ecc451de-4ad7-411d-8220-db4356a349a4",
              "newAssetId": "19ad0074-c905-45c9-9106-ec59565d91aa"
            },
            {
              "oldAssetId": "4839773f-5118-4c4a-ab1a-d0a2f940576e",
              "newAssetId": "1c389b98-c439-40ad-a66b-59b10a55ce41"
            },
            {
              "oldAssetId": "edea2b53-c884-4e93-bb24-86e76ebe39be",
              "newAssetId": "48f93ab7-3d99-4830-9514-28b91346972a"
            },
            {
              "oldAssetId": "4945d5a9-e2d9-494d-bfb6-9f304f429f06",
              "newAssetId": "496f0940-44f5-46d9-be8d-f26f8238bf03"
            },
            {
              "oldAssetId": "a8a978b0-494b-4b14-95ff-9bba14787c0f",
              "newAssetId": "6cae5955-dc8a-409a-b520-5145a8f5da5c"
            },
            {
              "oldAssetId": "cbd27478-024b-41f3-8b03-4874f10c4189",
              "newAssetId": "826a36cf-4c43-4630-a076-721f3dbbab71"
            },
            {
              "oldAssetId": "9c6ea5cc-b773-4329-905b-0dde41a28044",
              "newAssetId": "84031e6b-beda-4ca9-84b4-219140695f62"
            },
            {
              "oldAssetId": "7bea9f69-3147-41a7-a894-a9c65f19c3bd",
              "newAssetId": "96cd9354-6af3-4af9-8317-1ec4ed6b5a6c"
            },
            {
              "oldAssetId": "87c2aa4a-8898-449c-8d02-e8bd93405319",
              "newAssetId": "a81c7588-07ce-42d5-a948-d91735031185"
            }
          ]
        },
        "fileData": {
          "fileName": "SAMPLE: Radio ThomHartman",
          "mimeType": "audio/mpeg",
          "size": 3600676
        },
        "recordingData": {}
          "status": "uploaded",
          "applicationId": "6a2baa8d-1ca4-4293-a018-2879c977eb7f",
          "startDateTime": "1476720952",
          "stopDateTime": "1476721852"
        }
      ]
    }
  }
}
```

### Get a recording, with clone ID mapping filtered

```
{
  assetContainer(id: "21098186") {
  	id
		createdDateTime

    cloneData {
      originalId
      cloneBlobs
      assetIdMap (oldAssetId: "8cb92655-ae9b-44d0-809e-4bdf91cd325c"){
        newAssetId
        oldAssetId
      }
    }
    programData {
      programLiveImage
    }
    recordingData {
      status
      applicationId
      startDateTime
      stopDateTime
    }
    fileData {
      fileName
      mimeType
      size
    }
	}
}
```

Returns something like this:

```
{
  "data": {
    "assetContainer": {
      "id": "21098186",
      "createdDateTime": 1476741,
      "cloneData": {
        "originalId": "16344085",
        "cloneBlobs": false,
        "assetIdMap": [
          {
            "newAssetId": "0c06ef4b-9403-4a50-b82e-32ab8c2828d2",
            "oldAssetId": "8cb92655-ae9b-44d0-809e-4bdf91cd325c"
          }
        ]
      },
      "programData": {
        "programLiveImage": "https://s3.amazonaws.com/dev-veritone-ugc/demo_temp%2FprogramImageURL%2FabhgvGWRDusy82g41Tkg_KSWD1.jpg"
      },
      "recordingData": {
        "status": "uploaded",
        "applicationId": "6a2baa8d-1ca4-4293-a018-2879c977eb7f",
        "startDateTime": 1462803,
        "stopDateTime": 1462804
      },
      "fileData": {
        "fileName": "SAMPLE: Radio KSWDFM",
        "mimeType": "audio/mpeg",
        "size": 7200951
      }
    }
  }
}
```

### Get all recordings in application with some fields included

```
{
  assetContainers {
  id

	createdDateTime
	cloneData {
    assetIdMap {
      newAssetId
      oldAssetId
    }
  }
  fileData {
    size
  }
}
}

```

Returns something like this:

```
{
  "data": {
    "assetContainers": [
      {
        "id": "21098183",
        "createdDateTime": null,
        "cloneData": {
          "assetIdMap": [
            {
              "newAssetId": "1f300121-d223-46e2-ac5a-b122db2d55f0",
              "oldAssetId": "501d7bc0-30a8-4a59-bfde-50a30f87becd"
            },
            {
              "newAssetId": "26e2dcde-1315-461e-8a05-0db85848efca",
              "oldAssetId": "00bfba29-4d30-48d6-a371-a858090a7a6c"
            },
            {
              "newAssetId": "39e69cc3-b275-4a05-9dd7-cfb375393c71",
              "oldAssetId": "2c9979cc-72b3-4454-916a-7328004478e2"
            },
            {
              "newAssetId": "449bd404-5bc7-4637-afcd-c0568aaa70ca",
              "oldAssetId": "c54f21ef-9a92-49e0-bd7e-1cf81854501e"
            },
            {
              "newAssetId": "582fb6f6-35ed-4dbe-9a71-b8cfd09e5ec7",
              "oldAssetId": "acfc5122-2aa8-4a49-a8b1-6c8458f71b49"
            },
            {
              "newAssetId": "5a0a70bd-9f94-4d95-8651-e32d2afe5954",
              "oldAssetId": "823f0f5f-5ad6-4405-a7f5-71158fc4bac2"
            },
            {
              "newAssetId": "5e8329f3-ebf1-4b3f-a9bc-782021a7280d",
              "oldAssetId": "7306f48d-fbb2-4d10-be3e-565bb69819c1"
            },
            {
              "newAssetId": "f3676e43-0f4b-4bf8-9d95-06c1343486c3",
              "oldAssetId": "8d397d77-bd78-43fc-b1ef-c1b73da62688"
            },
            {
              "newAssetId": "fe9cc409-3518-48dc-b09f-a47cca3b722a",
              "oldAssetId": "5416f84b-f9e9-42f5-b374-d6f337c5750c"
            }
          ]
        },
        "fileData": {
          "size": 18221892
        }
      },
      ...
   ]
}
```

### Get an asset container with its assets

```
{
  assetContainer(id: "2870562") {
  	id
		createdDateTime

    cloneData {
      originalId
      cloneBlobs
      assetIdMap{
        newAssetId
        oldAssetId
      }
    }
    programData {
      programLiveImage
    }
    recordingData {
      status
      applicationId
      startDateTime
      stopDateTime
    }
    fileData {
      fileName
      mimeType
      size
    }
    assets {
      ...mediaFields
      ... on Transcript {
          mediaAssetId
          id
          __typename
      }
    }
  }
}

fragment mediaFields on MediaFile {
  _uri
  id
  contentType
  assetType
}

fragment transcriptFields on Transcript {
  mediaAssetId
  id
  assetType
}
```

Returns something like:

```
{
  "data": {
    "assetContainer": {
      "id": "2870562",
      "createdDateTime": 1426511,
      "cloneData": null,
      "programData": {
        "programLiveImage": "https://s3.amazonaws.com/prod-veritone-ugc/cb5e52b4-a986-4e2b-b525-482319df3350%2FbrdProgram%2F5MisVt0JSAa7oQOSgiqS_costa2.JPG"
      },
      "recordingData": {
        "status": "recorded",
        "applicationId": "cd1ecc60-36f3-4605-8d10-919991a1f7ab",
        "startDateTime": 1426511,
        "stopDateTime": 1426511
      },
      "fileData": {
        "fileName": "De Costa a Costa_1426511400",
        "mimeType": "audio/mpeg",
        "size": 0
      },
      "assets": [
        {
          "_uri": "https://s3.amazonaws.com/inspirent/recordings/707d7180-4eaf-4714-7260-a9347bcbdb09_original.mp3",
          "id": "2870562.media",
          "contentType": "audio/mpeg",
          "assetType": "media"
        }
      ]
    }
  }
}
```

### Get a single asset

```
{
  assetContainer(id: "2870562") {
  	id

    assets(assetId: "2870562.media") {
      ...mediaFields
      ...transcriptFields

    }
	}
}

fragment mediaFields on MediaFile {
  _uri
  id
  contentType
  assetType
}

fragment transcriptFields on Transcript {
  mediaAssetId
  id
  assetType
}
```

## Sample Mutations (write operations)

### Create an asset container (recording)

```
mutation {
  createAssetContainer(input: {
    	recordingData: {
    	mediaId: "210984221",
    	status: "uploaded",
    	applicationId: "6a2baa8d-1ca4-4293-a018-2879c977eb7f",
    	startDateTime: 1476726655,
    	stopDateTime: 1476726655
  }
  }) {
    	id
    	createdDateTime
    	recordingData {
        startDateTime
        stopDateTime
        status
      }
  }
}
```

Creates the new object and returns:

```
{
  "data": {
    "createAssetContainer": {
      "id": "21098441",
      "createdDateTime": 1476726655,
      "recordingData": {
        "startDateTime": 1476726655,
        "stopDateTime": 1476726655,
        "status": "uploaded"
      }
    }
  }
}
```

### Update an asset container (recording)

```
mutation {
  updateAssetContainer(input: {
    id: "21098454",
    	stopDateTime: 1430799,
        status:"uploaded"

  }) {
    	id
    	createdDateTime
        startDateTime
        stopDateTime
        status

  }
}
```

Updates the object and returns something like:

```
{
  "data": {
    "updateAssetContainer": {
      "id": "21098454",
      "createdDateTime": 1476726655,
      "recordingData": {
        "startDateTime": 1430797,
        "stopDateTime": 1430799,
        "status": "uploaded"
      }
    }
  }
}
```

### Delete an asset container (recording)

```
mutation {
  deleteAssetContainer(input: "21098454") {
    id
    message
  }
}
```

Returns something like this:

```
{
  "data": {
    "deleteAssetContainer": {
      "id": "21098454"
    }
  }
}
```

### Create a media file asset and upload a file

To create an asset and upload its content in a single request to GraphQL,
use a multipart form POST.

The form data should contain two parameters: _query_ and _file_.
`query` should look like so:

```
mutation {
  createAsset(
     input:  {
       containerId:  "21098614",
       assetType:"v-vlf"
       contentType: "application/json",

       metadata: {
        size: 159247,
        source: "voicebase",
        fileName: "voicebase.vlf.json"
       }
  }) {
     id

  }
}
```

Modify containerId, assetType and other input fields as needed.
Note that `metadata` is a `JSONData` field. You can arbitrary elements
using the normal GraphQL syntax; the field is not typed.

`file` should the asset media file.

The request will create the asset, upload the file to S3, and return something
like this:

```
{
    "data": {
        "createAsset": {
            "id": "9241e51b-a59d-489a-8ff9-3817fd65a654",
            "uri": "https://s3.amazonaws.com/dev.inspirent/assets/21098614/b55a96c1-20d7-43cb-88cc-8a2df18a6c4a.bin"
        }
    }
}
```

### Delete an asset

```
mutation {
  deleteAsset(assetId: "4e4b5189-c83b-446b-bd72-dc82fd9acf93", containerId: "21098614") {
    id

  }
}
```

### Get a clone job by ID

```
{
  cloneJobs(id: "45b7f3ef-a860-4ee7-85d3-46a30bc3a515") {
    id
    sourceApplicationId
    destinationApplicationId
    status
    numberOfRecordings
    numberOfCompletedRecordings
    percentage
  }
}
```

Returns:

```
{
  "data": {
    "cloneJobs": [
      {
        "id": "45b7f3ef-a860-4ee7-85d3-46a30bc3a515",
        "sourceApplicationId": "6fe3af75-7292-49a0-b949-bd6ea7871686",
        "destinationApplicationId": "17450d79-4843-47c3-8c02-1cd6c0838e5b",
        "status": "complete",
        "numberOfRecordings": 6,
        "numberOfCompletedRecordings": 6,
        "percentage": 1
      }
    ]
  }
}
```

Remove the "id" parameter to get the list of all clones.

### Get an engine by ID

```
{
  engines(id: "1edb5cdd-0e92-4384-aa3e-3fe50f15283f") {
    id
    ownerOrganizationId
    isPublic
    name
    description
    categoryId
    state
    price
    asset
    displayName
    validateUri
    executeUri
  }
}
```

Returns

```
{
  "data": {
    "engines": [
      {
        "id": "1edb5cdd-0e92-4384-aa3e-3fe50f15283f",
        "ownerOrganizationId": "7682",
        "isPublic": false,
        "name": "Test 2",
        "description": "Test 2",
        "categoryId": "67cd4dd0-2f75-445d-a6f0-2f297d6cd182",
        "state": "pending",
        "price": 100,
        "asset": null,
        "displayName": null,
        "validateUri": null,
        "executeUri": null
      }
    ]
  }
}
```

### Query a list of engines

Here we'll get a listing matching a set of criteria. In this example
it's all public engines.

```
{
  engines(libraryRequired: true) {
    id
    ownerOrganizationId
    isPublic
    name
    description
    categoryId
    state
    price
    asset
    displayName
    validateUri
    executeUri
  }
}
```

Returns

```
{
  "data": {
    "engines": [
      {
        "id": "1edb5cdd-0e92-4384-aa3e-3fe50f15283f",
        "ownerOrganizationId": "7682",
        "isPublic": false,
        "name": "Test 2",
        "description": "Test 2",
        "categoryId": "67cd4dd0-2f75-445d-a6f0-2f297d6cd182",
        "state": "pending",
        "price": 100,
        "asset": null,
        "displayName": null,
        "validateUri": null,
        "executeUri": null
      },
      {
        "id": "ebe9ae4a-8871-4cbf-8d23-4356d1843047",
        "ownerOrganizationId": "7682",
        "isPublic": false,
        "name": "Test",
        "description": "Test",
        "categoryId": "67cd4dd0-2f75-445d-a6f0-2f297d6cd182",
        "state": "pending",
        "price": 100,
        "asset": null,
        "displayName": null,
        "validateUri": null,
        "executeUri": null
      },
      {
        "id": "transcribe-speechmatics-container-en-us",
        "ownerOrganizationId": "7682",
        "isPublic": true,
        "name": "Supernova-English (US)",
        "description": "Supernova-English (US) is the network isolated version of one of our most popular and accurate transcription engines, with robust language capabilities.",
        "categoryId": "67cd4dd0-2f75-445d-a6f0-2f297d6cd182",
        "state": "active",
        "price": 300,
        "asset": "speechmatics-container-en-us",
        "displayName": null,
        "validateUri": null,
        "executeUri": null
      },
      ...
      ]
  }
```

### Get engine blacklist

Query:

```
{
  engineBlacklist(organizationId: "7599") {
    organizationId

    engines {
      id
      name
      description
      logoPath
    }

    engineCategories {
      id
      name
    }
  }
}
```

Response:

```
{
  "data": {
    "engineBlacklist": [
      {
        "organizationId": "7599",
        "engines": [
          {
            "id": "translate-babeltranslate",
            "name": "Google Translate",
            "description": "Google Translate is a best-in-class multi language translation engine, optimized to run on the Veritone aiWARE Platform. Choose from a variety of languages for realtime, reliable translation.",
            "logoPath": "https://s3.amazonaws.com/dev-veritone-ugc/d9cd0ef5-5809-44d5-999a-f053acb82732%2Fcollections%2FwDSMesqgRR2vaPMTt8a0_googletranslate.png"
          }
        ],
        "engineCategories": []
      }
    ]
  }
}
```

### Get engine categories

Query:

```
{
  engineCategories {
      id
    name
    description
    videoOnly
    createdDateTime
    modifiedDateTime
  }
}
```

Response:

```
{
  "data": {
    "engineCategories": [
      {
        "id": "203ad7c2-3dbd-45f9-95a6-855f911563d0",
        "name": "Geolocation",
        "description": "Extract Location, acceleration, velocity and altitude from the media",
        "videoOnly": false,
        "createdDateTime": "1490754945",
        "modifiedDateTime": "1490754945"
      },
      {
        "id": "c6e07fe3-f15f-48a7-8914-951b852d54d0",
        "name": "Audio Detection",
        "description": "Detect characteristics of sound, including alarms, breaking glass, gunshots and more within audio",
        "videoOnly": false,
        "createdDateTime": "1490754945",
        "modifiedDateTime": "1490754945"
      },
      {
        "id": "c96b5d0e-3ce1-4fd7-9c38-d25ddef87a5f",
        "name": "Music Detection",
        "description": "Identify the music playing in the background of media",
        "videoOnly": false,
        "createdDateTime": "1490754945",
        "modifiedDateTime": "1490754945"
      },
      {
        "id": "4be1a1b2-653d-4eaa-ba18-747a265305d8",
        "name": "Ingestion",
        "description": null,
        "videoOnly": false,
        "createdDateTime": "1490754945",
        "modifiedDateTime": "1490754945"
      },
      {
        "id": "3b2b2ff8-44aa-4db4-9b71-ff96c3bf5923",
        "name": "Translate",
        "description": "Translate transcribed text from one language to another",
        "videoOnly": false,
        "createdDateTime": "1490754945",
        "modifiedDateTime": "1490754945"
      },
      {
        "id": "4fef6040-3fb6-4757-9aae-4044e8b46bc9",
        "name": "Search",
        "description": null,
        "videoOnly": false,
        "createdDateTime": "1490754945",
        "modifiedDateTime": "1490754945"
      },
      {
        "id": "f2554098-f14b-4d81-9be1-41d0f992a22f",
        "name": "Sentiment",
        "description": "Infer the sentiment or emotion being emitted in media",
        "videoOnly": false,
        "createdDateTime": "1490754945",
        "modifiedDateTime": "1490754945"
      },
     ...
     ]
   }
 }
```

### Get an engine category

Query:

```
{
  engineCategories(id: "f2554098-f14b-4d81-9be1-41d0f992a22f") {
    id
    name
    description
    videoOnly
    createdDateTime
    modifiedDateTime
  }
}
```

Response:

```
{
  "data": {
    "engineCategories": [
      {
        "id": "f2554098-f14b-4d81-9be1-41d0f992a22f",
        "name": "Sentiment",
        "description": "Infer the sentiment or emotion being emitted in media",
        "videoOnly": false,
        "createdDateTime": "1490754945",
        "modifiedDateTime": "1490754945"
      }
    ]
  }
}
```

### Get tasks for an engine

This request gets a single page of failed tasks for a given engine, "transcribe":

```
{
  engines(id: "transcribe") {
    id
    ownerOrganizationId
    isPublic
    name
    description
    categoryId
    state
    price
    asset
    displayName
    validateUri
    executeUri
    tasks(status: "failed") {
      offset
      limit
      count
      tasks {
        applicationId
        status
        queuedDateTime
        completedDateTime
       id
      }
    }
  }
}
```

Response:

```
{
  "data": {
    "engines": [
      {
        "id": "transcribe",
        "ownerOrganizationId": "7682",
        "isPublic": true,
        "name": "Microsoft",
        "description": "Microsoft Azure Media Indexer automatically makes your media deeply searchable without the need for manually applied metadata. Using deep neural net (DNN)-based speech recognition technology from Microsoft Research, Media Indexer converts digital audio into natural language and automatically extracts meaningful metadata from your media.",
        "categoryId": "67cd4dd0-2f75-445d-a6f0-2f297d6cd182",
        "state": "active",
        "price": 250,
        "asset": "azure",
        "displayName": null,
        "validateUri": null,
        "executeUri": null,
        "tasks": {
          "offset": 0,
          "limit": 30,
          "count": 30,
          "tasks": [
            {
              "applicationId": "e63203a8-4b29-43ed-a7cb-666716952928",
              "status": "failed",
              "queuedDateTime": "1499370987",
              "completedDateTime": "1499399735",
              "id": "30wnka59.afebe4.0"
            },
            {
              "applicationId": "e63203a8-4b29-43ed-a7cb-666716952928",
              "status": "failed",
              "queuedDateTime": "1499367529",
              "completedDateTime": "1499367555",
              "id": "30wli5ow.2945fb.0"
            },
            {
              "applicationId": "b3f442e5-b58c-4a22-9946-4d9b5baf62e1",
              "status": "failed",
              "queuedDateTime": "1499351888",
              "completedDateTime": "1499352063",
              "id": "30wc6wae.1d1495.0"
            },
            ...
        ]
    }
}
```

### Get a single engine task

Request:

```
{
  engines(id: "transcribe") {
    id

    taskList(id:"30wnka59.afebe4.0") {
      offset
      limit
      count
      tasks {
        applicationId
        status
        queuedDateTime
        completedDateTime
       id
      }
    }
  }
}
```

Response:

```
{
  "data": {
    "engines": [
      {
        "id": "transcribe",
        "taskList": {
          "offset": 0,
          "limit": 30,
          "count": 1,
          "tasks": [
            {
              "applicationId": "e63203a8-4b29-43ed-a7cb-666716952928",
              "status": "failed",
              "queuedDateTime": "1499370987",
              "completedDateTime": "1499399735",
              "id": "30wnka59.afebe4.0"
            }
          ]
        }
      }
    ]
  }
}
```

### Get second page of engine builds

```
{
  engines(id: "imagedetection-objectrecognition-watson-visual-recognition") {
    id

    buildList(offset:21, limit: 20) {
      offset
      limit
      count
      builds {
       id
        version
        dockerImage
        modifiedDateTime
      }
    }
  }
}
```

Response:

```
{
  "data": {
    "engines": [
      {
        "id": "imagedetection-objectrecognition-watson-visual-recognition",
        "buildList": {
          "offset": 21,
          "limit": 20,
          "count": 20,
          "builds": [
            {
              "id": "2f68f3d9-7d71-4183-a8bb-fda8bee73ef1",
              "version": "427",
              "dockerImage": "docker-image-thing-here",
              "modifiedDateTime": "1498515412"
            },
            {
              "id": "aee7e19c-d3c2-49b2-8f1d-ef907cac8930",
              "version": "426",
              "dockerImage": "",
              "modifiedDateTime": "1498515412"
            },
            {
              "id": "298a0f69-f0fd-4361-bd1d-5fc859a8e93e",
              "version": "425",
              "dockerImage": "",
              "modifiedDateTime": "1498515412"
            },
            {
              "id": "f634b9bf-b1d9-4946-922f-0fb94e372980",
              "version": "424",
              "dockerImage": "docker-image-thing-here",
              "modifiedDateTime": "1498511094"
            },
            {
              "id": "42506763-672e-4b89-8384-df6f44ec251b",
              "version": "423",
              "dockerImage": "",
              "modifiedDateTime": "1498511094"
            },
            {
              "id": "2dda0c49-cc4c-40ee-9531-099439af44bd",
              "version": "422",
              "dockerImage": "",
              "modifiedDateTime": "1498511094"
            },
            ...
        ]
    }
}
```

### Get a single engine build

Request:

```
{
  engines(id: "imagedetection-objectrecognition-watson-visual-recognition") {
    id

    buildList(id:"2f68f3d9-7d71-4183-a8bb-fda8bee73ef1") {
      builds {
       id
        version
        dockerImage
        modifiedDateTime
      }
    }
  }
}
```

Response:

```
{
  "data": {
    "engines": [
      {
        "id": "imagedetection-objectrecognition-watson-visual-recognition",
        "buildList": {
          "builds": [
            {
              "id": "2f68f3d9-7d71-4183-a8bb-fda8bee73ef1",
              "version": "427",
              "dockerImage": "docker-image-thing-here",
              "modifiedDateTime": "1498515412"
            }
          ]
        }
      }
    ]
  }
}
```

### Get jobs for a given application

Query:

```
{
  jobs(applicationId: "e63203a8-4b29-43ed-a7cb-666716952928") {
      records {
        id
        targetId
        modifiedDateTime
      }
      offset
      limit
      count

  }
}
```

Response:

```
{
  "data": {
    "jobs": {
      "jobs": [
        {
          "id": "30xaoql7.c17932",
          "targetId": "35594505",
          "modifiedDateTime": "1499409826"
        },
        {
          "id": "30xan353.2e375a",
          "targetId": "35594505",
          "modifiedDateTime": "1499409749"
        },
        {
          "id": "30xajwvt.03ba0b",
          "targetId": "21097083",
          "modifiedDateTime": "1499409601"
        },
        ...
    ],
      "offset": 0,
      "limit": 30,
      "count": 30
  }
}

```

### Get a job and its tasks

Request:

```
{
  jobs(id:"30xaoql7.c17932") {
      records {
        id
        targetId

        modifiedDateTime

        taskList {
          count
          records {
            id
            targetId
          }
        }
      }
      offset
      limit
      count

  }
}
```

Response:

```
{
  "data": {
    "jobs": {
      "jobs": [
        {
          "id": "30xaoql7.c17932",
          "targetId": "35594505",
          "modifiedDateTime": "1499409826",
          "taskList": {
            "count": 1,
            "tasks": [
              {
                "id": "30xaoql7.c17932.0",
                "targetId": "35594505"
              }
            ]
          }
        }
      ],
      "offset": 0,
      "limit": 30,
      "count": 1
    }
  }
}
```

### Get jobs and their tasks associated with a given target (recording)

```
{
  jobs(targetId: "21097083") {
      records {
        id
        applicationId

        modifiedDateTime
				taskList {
          count
          records {
            id
            status
            order
            completedDateTime
          }
        }
      }
      offset
      limit
      count
  }
}
```

```
{
  "data": {
    "jobs": {
      "records": [
        {
          "id": "30xajwvt.03ba0b",
          "applicationId": "e63203a8-4b29-43ed-a7cb-666716952928",
          "modifiedDateTime": "1499409601",
          "taskList": {
            "count": 1,
            "records": [
              {
                "id": "30xajwvt.03ba0b.0",
                "status": "complete",
                "order": 0,
                "completedDateTime": "1499409639"
              }
            ]
          }
        },
        {
          "id": "30wz6acn.218f08",
          "applicationId": "e63203a8-4b29-43ed-a7cb-666716952928",
          "modifiedDateTime": "1499390490",
          "taskList": {
            "count": 2,
            "records": [
              {
                "id": "30wz6acn.218f08.1",
                "status": "failed",
                "order": 1,
                "completedDateTime": "1499390923"
              },
              {
                "id": "30wz6acn.218f08.0",
                "status": "complete",
                "order": 0,
                "completedDateTime": "1499390916"
              }
            ]
          }
        },
        ...
    ]
    "offset": 0,
     "limit": 30,
     "count": 16
     }
  }
}
```

### Get Widget

```
{ widget (
    id: "WxCTiXp7SpW-0e7ERqz__w”
    organizationId: "7682",
    collectionId: "1705"
  ) {
    id
  }
}
```

Response

```
{
  "data": {
    "widget": {
      "id": "WxCTiXp7SpW-0e7ERqz__w"
    }
  }
}
```

### Create Widget

```
mutation {
  createWidget(input: {
    organizationId: “7682",
    collectionId: "1705",
    folderId: "1705",
    name: "graphql-test-createWidget",
    adScript: "",
    seoTags: ["GraphQL Test"],
    width: 400,
    textColor: "FFFFFF",
    borderColor: "D8D8D8",
    backgroundColor: "FFFFFF",
    displayLogo: true,
    displayCollectionName: true,
    displayMentionIntro: true,
    displayTranscription: true,
    numberOfMentionsToShow: 10
  }) {
        id
        name
        width
  }
}
```

Response

```
{
  "data": {
    "createWidget": {
      "id": "WxCTiXp7SpW-0e7ERqz__w",
      "name": "graphql-test-createWidget",
      "width": 600
    }
  }
}
```

### Update Widget

```
mutation {
  updateWidget(input: {
    id: "WxCTiXp7SpW-0e7ERqz__w",
    name: "test",
    organizationId: "7682",
    collectionId: "1705",
    adScript: "<script>track('XYZ');</script>",
    backgroundColor: "FFFFFF",
    borderColor: "D8D8D8",
    textColor: "FFFFFF",
    width: 52,
    numberOfMentionsToShow:1,
    displayCollectionName: true,
    displayLogo: true,
    displayMentionIntro: true,
    displayTranscription: true
  }) {
        id
        name
        width
  }
}
```

Response:

```
{
  "data": {
    "updateWidget": {
      "id": "WxCTiXp7SpW-0e7ERqz__w",
      "name": "test",
      "width": 600
    }
  }
}
```

### Get folders for an organization

```
{

  organizations(offset: 30, limit: 100) {
    records {
      id
      name
       cmsFolder: rootFolder(type: cms) {
        id
        subfolders {
          id
        }
      }
      watchlistFolder: rootFolder(type: watchlist) {
        id
        createdDateTime
        modifiedDateTime
        status
        subfolders {
          id
          status
        }
			}
      collectionFolder: rootFolder(type: collection) {
        id
        subfolders {
          id
        }
      }
    }
  }
}
```

Response:

```
{
  "data": {
    "organizations": {
      "records": [
        {
          "id": "7323",
          "name": "A-1 Communications Inc",
          "cmsFolder": null,
          "watchlistFolder": {
            "id": "dd267443-85cb-472d-879a-117cd92cece8",
            "createdDateTime": "Fri Nov 04 2016 19:16:44 GMT-0700 (PDT)",
            "modifiedDateTime": "Fri Nov 04 2016 19:16:44 GMT-0700 (PDT)",
            "status": "active",
            "subfolders": null
          },
          "collectionFolder": null
        },
        {
          "id": "4539",
          "name": "A and D Broadcasting",
          "cmsFolder": null,
          "watchlistFolder": {
            "id": "e98892cc-09c0-449b-85f0-b7b6dd409fe5",
            "createdDateTime": "Fri Nov 04 2016 19:09:44 GMT-0700 (PDT)",
            "modifiedDateTime": "Fri Nov 04 2016 19:09:44 GMT-0700 (PDT)",
            "status": "active",
            "subfolders": null
          },
          "collectionFolder": null
        },
        ...
```

### Create Folder

```
mutation {
  createFolder(input: {
    name: "singular test",
    description:"singular test description",
    parentId: "a70daeab-b538-4c83-9f83-f9397a229bce",
    orderIndex: 0
  }) {
    id
  }
}
```

Response:

```
{
  "data": {
    "createFolder": {
      "id": "8d2e6f31-0aac-43b9-90fb-50dda7700066"
    }
  }
}
```

### Update Folder

This mutation only allows you to change the name of the folder.

```
mutation {
  updateFolder(input: {
    id: "8d2e6f31-0aac-43b9-90fb-50dda7700066"
    name: "final test 123",
    organizationId: 7682
  }) {
    id
    name
  }
}
```

Response:

```
{
  "data": {
    "updateFolder": {
      "id": "8d2e6f31-0aac-43b9-90fb-50dda7700066",
      "name": "final test 123"
    }
  }
}
```

### Delete Folder

```
mutation {
  deleteFolder(input: {
    id: "09d5a023-05c6-4def-a8b4-e7f539c839c4"
    orderIndex: 0
  }) {
    id
  }
}
```

Response:

```
{
  "data": {
    "deleteFolder": {
      "id": "09d5a023-05c6-4def-a8b4-e7f539c839c4"
    }
  }
}
```
