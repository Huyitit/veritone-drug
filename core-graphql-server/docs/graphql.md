
# Veritone GraphQL API

## What is GraphQL?

GraphQL (http://graphql.org/) is a _query language_. It allows users to
format queries that specify exactly what information they want to send
or receive, using a formal schema defined by the GraphQL provider.

## Why is Veritone using GraphQL for its APIs?

Veritone uses GraphQL to provide a clean, unified interface to its data and operations.
GraphQL has many benefits over a traditional REST API.

* Users can control exactly what information they get back with each operation
* The schema is self-documenting and reduces errors and time wasted from bad input
* The GraphiQL user interface allows a user to easily explore the schema and
all the information available to them


## How do I use GraphQL?

For detailed information about GraphQL, see the main GraphQL site (http://graphql.org).
This document contains a high-level overview and some information specific
to Veritone's implementation.

A GraphQL schema defines _types_ and _fields_ on those types.
That's it. Typically, a schema defines a set of _queries_ as entry points
to the data model. For example, in a schema you might see something like this:

```
schema {
  query: Query
}

type Query {
  objects(objectName: String):  [MyObjectType]
}

type MyObjectType {
  name: String
}
```

However, that's just convention -- a query is, in the schema,
just a field on a type. In this example, `query` is the root of our schema.

To query, you send a string in GraphQL that specifies the fields you
want, and any parameters on them.
So for this simple schema we might send:
```
query {
  objects(objectName: "my sample object?") {
    name
  }
}
```

Here we are specifying the top-level field on the schema (`query`),
and asking for one field (`objects`). `objects` is a field that
takes a single optional parameter, `objectName`, and returns a list
of `MyObjectType`. We've passed in the parameter `objectName: "my sample object"`.

It's up to the server how to resolve each requested field and interpret the
parameters. All data might reside in a single back-end database schema
On the other hand, the server might populate some fields by reaching out to
other sources such as REST services or even external services.

Take this example:
```
type MyObjectType {
  name: String
  data: ObjectData
}

type ObjectData {
  ...
}
```

`name` and the list of `MyObjectType` might live in one backend database,
while the server populates `data` for each object by calling out to an
external REST service.

To modify data, you use a _mutation_. A mutation is formatted like
a query and can return information like a query, but modifies data in some
way (create, update, or delete).

Mutations take, as parameters, special types called _inputs_. An input
contains those fields necessary to create or modify an instance of the
related type.

Continuing our example, we might have:
```
type MyObjectType {
  # A name for the object, provided by the user. Required.
  name: String!

  # A unique and invariant server-defined ID for the object
  id: ID!
}

input CreateMyObject {
  # Provide a name for your object
  name: String!
}

mutation {
  createMyObject(input: CreateMyObject!): MyObjectType
}
```

We've defined an object type that has some fields provided by
the user, and some fields controlled by the server.
Our input type contains only those fields that can (and must) be provided
by the user. Our mutation take the input type and returns a new object.

```
mutation {
  createMyObject(input: {
      name: "my new object"
    }) {
      id
      name
    }
}
```
It would return something like:
```
{
  "data": {
    "createMyObject": {
      "id": "37dbf368-7c76-45c8-8b96-c1e90b0c5ec2"
      "name": "my new object"
    }
  }
}
```

## Veritone's schema

Now let's take a look at the Veritone schema. You can refer to the following links:
For dev:
* [https://api.aws-dev.veritone.com/v3/graphiql](GraphiQL on dev)
For stage:
* [https://api.aws-stage.veritone.com/v3/graphiql](GraphiQL on stage)

If you're new to our schema, try using the `me` query to explore the data.

```
query {
  me {
    id
    name
    # use <ctrl-space> to get a list of fields available at each level
  }
}
```

Queries that support paging all use a consistent set of parameters and
return fields based on the interface `Page`. You specify an optional
`offset` and `limit` as parameters, and receive back an object with
fields `offset`, `limit`, `count` (number of objects actually returned), and
`records` containing the list of results.

## Authenticating to the Veritone GraphQL server

See [Security Overview](https://veritone-developer.atlassian.net/wiki/spaces/DOC/pages/13893759/Security+Overview) for details on authenticating to Veritone APIs.

## GraphQL hints and tips

Use GraphiQL to explore the schema, make ad hoc queries to find data, and
test and debug queries and mutations for your applications.

You can request as many fields as you want on a given type -- including the
top-level query. Thus, you can, effectively, make multiple queries in a single
request.

GraphQL lets you structure complex queries that retrieve, aggregate, and marshal
large amounts of data. Use with caution. Complex queries over large data sets
can affect performance.

You can retrieve the same field twice, say to apply different parameters,
using aliases. For example:
```
query {
  firstUser: user(name:"smith") {
    ...
  }
  secondUser: user(name:"jones") {
    ...
  }
  thirdUser: user(id:"...") {
    ...
  }
}
```

GraphQL supports interfaces and unions. A field that uses an interface or
union can include any of several types. All types that implement a given
interface have common fields that can be requested in the usual way.
However, to request a type-specific field you must use a _fragment_.
Here is an example using `TemporalDataObject`, which accepts in interface,
`Metadata` in its metadata field. We'll ask for a common field, `name`,
along with some fields that are specific to `Program`.

```
{
  temporalDataObjects(limit: 30) {
    records {   
  	   id  
       metadata {
         name
         ...on Program {
           image
           liveImage
         }
       }
     }
   }
}
```
The result will look something like this:
```
{
  "data": {
    "temporalDataObjects": {
      "records": [
        {
          "id": "21098452",
          "metadata": [],
          "status": "uploaded",
          "startDateTime": 0,
          "stopDateTime": 0
        },
        {
          "id": "21098441",
          "metadata": [],
          "status": null,
          "startDateTime": 0,
          "stopDateTime": 0
        },
        {
          "id": "21098183",
          "metadata": [
            {
              "name": "CloneData",
              "__typename": "CloneData"
            },
            {
              "__typename": "FileData",
              "name": "FileData"
            },
            {
              "__typename": "JSONObject",
              "name": "veritone-permissions"
            },
            {
              "name": "Program",
              "__typename": "Program",
              "image": "",
              "liveImage": "https://s3.amazonaws.com/dev-veritone-ugc/demo_temp%2FprogramImageURL%2Fo8poaodeRpmUJBNK3tKT_cw.png"
            }
          ]
        }
      ]
    }
  }
