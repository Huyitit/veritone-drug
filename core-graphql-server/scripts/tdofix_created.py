# see also https://steel-ventures.atlassian.net/wiki/spaces/VT/pages/1008338234/TDO+created+date+time+data+migration

import sys
import json
import pg8000
import argparse
import traceback
import datetime
from datetime import timedelta

parser = argparse.ArgumentParser(description='Back-populate created_date_time and modified_date_time columns in recording table.')
parser.add_argument('--conf', type=argparse.FileType('r'), default='./config.json', help='The config file path.')
parser.add_argument('--max_rows', type=int, default=100000, help='Maximum number of rows to process.')
parser.add_argument('--page_size', type=int, default=10, help='The query page size.')
parser.add_argument('--months_back', type=int, default=0, help='Month to query into, from 6/24/2019 backwards.')
parser.add_argument('--dry_run', action='store_true', default=False, help='Dry run does not modify any data.')
parser.add_argument('--org_id', action='append', default=[], help='Org ID to process. Multiple values can be applied.')
parser.add_argument('--year', help='Year to process. Use only if months_back is not used.')
args = parser.parse_args()

config = json.load(args.conf);

if config.get('host', None) is None:
    print 'Config file is missing "host"'
    sys.exit(1)
if config.get('user', None) is None:
    print 'Config file is missing "user"'
    sys.exit(1)
if config.get('password', None) is None:
    print 'Config file is missing "password"'
    sys.exit(1)

is_real = args.dry_run is False
if args.dry_run:
    print 'DRY RUN MODE ONLY. We will not modify any data.'

# get media db host from config
core_host = config['host']
password = config['password']
max_rows = args.max_rows
limit = args.page_size
months_back = args.months_back
year = args.year

core_conn = pg8000.connect(user = 'postgres', password = password, database = 'platform', host = core_host)
print('--- connected to %s ---' % core_host)
media_conn = pg8000.connect(user = 'postgres', password = password, database = 'sso', host = core_host.replace('pg-core', 'pg-media'))

if months_back > 0:
    if year is not None:
        print('use either --months-back or --year, not both')
        sys.exit(1)
    start_delta = timedelta(days = (months_back - 1) * 30)
    stop_delta = timedelta(days = 30)
    start_date_time = datetime.datetime.strptime('2019-06-25T00:00:00Z', '%Y-%m-%dT%H:%M:%SZ')
    qs = start_date_time - start_delta
    query_start_date_time = qs.isoformat()
    qs = qs - stop_delta
    query_stop_date_time = qs.isoformat()
else:
    # if neither param was sent, default to 2019
    if year is None:
        year = '2019'

if year is not None:
    if year == '2019':
        date_end = datetime.datetime.strptime('2019-06-25T00:00:00Z', '%Y-%m-%dT%H:%M:%SZ')
    else:
        date_end = datetime.datetime.strptime('%s-12-31T23:59:59Z' % year, '%Y-%m-%dT%H:%M:%SZ')
    date_start = datetime.datetime.strptime('%s-01-01T00:00:00Z' % year, '%Y-%m-%dT%H:%M:%SZ')
    query_stop_date_time = date_start.isoformat()
    query_start_date_time = date_end.isoformat()

print('Query from start_date_time %s to %s' % (query_stop_date_time, query_start_date_time))

def get_app_ids(org_ids):
    app_ids = []
    for org_id in org_ids:
        sql = """
SELECT
    application_id
FROM sso_group
    WHERE kvp->>'organizationId' = $1::text;
"""
        cursor = media_conn.cursor()
        cursor.execute(sql, args = [org_id])
        res = cursor.fetchmany(1)
        row = res[0]
        org_id = row[0]
        cursor.close()
        app_ids.append(str(org_id))

    return app_ids

app_ids = get_app_ids(args.org_id)

print 'target app IDs are %s' % app_ids

def one_page(offset):
    app_clause = ''
    if len(app_ids) > 0:
        or_clause = []
        for app_id in app_ids:
            or_clause.append("application_id = '%s'" % app_id)
        app_clause = '(%s) AND' % ' OR '.join(or_clause)

    sql = """
SELECT
  recording_id,
  json->>'createdDateTime' created_date_time_json,
  json->>'modifiedDateTime' modified_date_time_json,
  json->>'startDateTime' j_start_date_time,
  json->>'stopDateTime' j_stop_date_time,
  start_date_time,
  stop_date_time
FROM
  recording.recording
WHERE
  %s
  start_date_time < $3 AND
  start_date_time > $4 AND
  created_date_time IS NULL
ORDER BY start_date_time desc
OFFSET $1 LIMIT $2
    """ % (app_clause)

    vars = [offset, limit, query_start_date_time, query_stop_date_time, app_ids]
    cursor = core_conn.cursor()
    print sql
    print vars
    cursor.execute(sql, args = vars)
    res = cursor.fetchmany(limit)

    rows = cursor.rowcount
    cursor.close()

    for row in res:
        id = row[0]
        created_date_time_json = row[1]
        modified_date_time_json = row[2]
        created = int(str(created_date_time_json))
        modified = int(str(modified_date_time_json))
        created_str = datetime.datetime.fromtimestamp(created).isoformat()
        modified_str =  datetime.datetime.fromtimestamp(modified).isoformat()
        st_updated = 'CR'
        if row[5] is None or row[6] is None:
            start_t = int(str(row[3]))
            stop_t = int(str(row[4]))
            start_str = datetime.datetime.fromtimestamp(start_t).isoformat()
            stop_str = datetime.datetime.fromtimestamp(stop_t).isoformat()
            sql = """UPDATE recording.recording SET created_date_time = '%s', modified_date_time = '%s', start_date_time = '%s', stop_date_time = '%s' WHERE recording_id = '%s' RETURNING recording_id, created_date_time, modified_date_time, start_date_time, stop_date_time, start_date_time""" % (created_str, modified_str, start_str, stop_str, id)
            st_updated = 'ST'
        else:
            sql = """UPDATE recording.recording SET created_date_time = '%s', modified_date_time = '%s' WHERE recording_id = '%s' RETURNING recording_id, created_date_time, modified_date_time, start_date_time""" % (created_str, modified_str, id)

        #print (sql)
        wcursor = core_conn.cursor()
        wcursor.execute(sql)
        res = wcursor.fetchmany(1)
        core_conn.commit()
        wcursor.close()
        rrow = res[0]
        print('%s:  %s %s %s %s' % (st_updated, rrow[0], rrow[3].isoformat(), rrow[1].isoformat(), rrow[2].isoformat()))

    return rows


def go():
    num_rows = 1
    offset = 0
    total_rows = 0
    while (num_rows > 0 and total_rows <= max_rows):
        num_rows = one_page(offset)
        offset += limit
        total_rows += num_rows

    print 'Total rows %d' % total_rows
    return total_rows

try:
    go()
except:
    print 'Migration failed with %s.' % sys.exc_info()[0]
    traceback.print_exc()
    sys.exit(1)
