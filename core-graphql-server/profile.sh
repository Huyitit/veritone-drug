RUN_ENVIRONMENT=LOCAL
NODE_ENV=prod

clinic bubbleprof --on-port 'autocannon -c 100 -a 1000 -m POST -H "Content-Type=application/json" -H "Authorization=Bearer task-insert-into-index-v7:a2817dfc62934cdeb60ee40f66d50b2c33d3a51822544bcfb88c19a76771eda1" -b "{\"query\": \"query { source(id:39031){ name id organizationId details } }\"}" http://localhost:$PORT/graphql' -- node --max_old_space_size=1978 server.js --conf=./server.jsonnpm