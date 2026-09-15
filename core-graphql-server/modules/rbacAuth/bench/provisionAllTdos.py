#!/usr/local/bin/python3
import psycopg2
import requests
from string import Template
import threading
import queue
import sys
from datetime import datetime

from elasticsearch import Elasticsearch


ENV = "dev"
API_ENDPOINT = "http://localhost:3000/graphql" ##'https://api.aws-' + ENV + '.veritone.com/v3/GraphQL'
es = Elasticsearch(['http://es-media-asg-data-lb.aws-' + ENV + '.veritone.com:9200'])

num_worker_threads = 5
defaultToken = "98f7d04e-5dea-4da8-9ba3-e1a8994cc8de"

counter = 0
total = 0


def callApi(ids):
	result = requests.post(
    API_ENDPOINT,
    headers={
        'Authorization': 'Bearer ' + defaultToken,
    },
    json={
        'query': '''
          mutation ($ids: [ID!]!) {
			addACEsToResources(resourceType: TDO ids:$ids entries: [
				{
					member: {
						id: "0cf1f5b7-68e8-435c-b058-bd1a8443c5ac"
						memberType: Group
					}
					permissionSetID: "f9dd8acd-5672-468c-ae72-d7ee045d9a2c"
				}
			]) {
				count
			}
		}
        ''',
        'variables': {
			'ids': ids
		},
    },
	)
	return result.json()


def process(tdoId):
	global counter
	global total
	counter += 1
	print(counter, total, tdoId)

q = queue.Queue()
def worker():
	while True:
		item = q.get()
		if item is None:
			break
		process(item['_routing'])
		#print("{},{}".format(, ))
		q.task_done()


threads = []
# for i in range(num_worker_threads):
#     t = threading.Thread(target=worker)
#     t.start()
#     threads.append(t)

def search(scroll_id):
	if scroll_id != None:
		return es.scroll(scroll_id = scroll_id, scroll='5m')
	return es.search(index="v3-2022.*", size=100, scroll='5m', body=
		{
			"query": {
				"bool": {
					"must":[
					{
						"term": {
							"sliceIndex": 0
						}
					},
					{
						"term": {
							"ownerApplicationId": "ed075985-bc94-406b-8639-44d1da42c3fb"
						}
					}
					]
				}
			},
			"_source": "ownerApplicationId",
		}
	)

def main():
	global total
	scroll_id = None
	while True:
		results = search(scroll_id)
		if len(results['hits']['hits']) == 0:
			break

		ids = []
		for doc in results['hits']['hits']:
			ids.append(doc['_routing'])
		added = callApi(ids)
		print(added)
		
		if scroll_id == None:
			total = results['hits']['total']['value']
			print("%d tdos found", total)
		scroll_id = results['_scroll_id']

	# block until all tasks are done
	# q.join()

	# # stop workers
	# for i in range(num_worker_threads):
	# 	q.put(None)
	# for t in threads:
	# 	t.join()

if __name__ == "__main__":
	main()