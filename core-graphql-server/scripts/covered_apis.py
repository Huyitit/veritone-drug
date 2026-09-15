#!/usr/bin/python

"""
This script determines which GQL APIs are covered by integration tests.

usage: covered_apis.py [-h] [--coverage-file COVERAGE_FILE]
                            [--original_files ORIGINAL_FILES [ORIGINAL_FILES ...]]
                            handler_lists [handler_lists ...]

positional arguments:
  handler_lists         files listing API handler function names, one name per line

optional arguments:
  -h, --help            show this help message and exit
  --coverage-file COVERAGE_FILE, -c COVERAGE_FILE
                        output of Istanbul coverage report
  --original_files ORIGINAL_FILES [ORIGINAL_FILES ...], -o ORIGINAL_FILES [ORIGINAL_FILES ...]
                        original .js files containing the API calls

Handler lists are functions that are called by API entries. The reason for using handlers and not the API functions
is because the latter are not declared as proper functions in the code and thus appear "anonymous" in the coverage
report. Those lists are created by hand or via shell scripts using various heuristics. Here is an example:

$ grep return ../modules/internalAPI/Query.js | awk -F '(' '{print $1}' | awk -F '.' '{print $NF}' | grep -v return > i_q_funcs.txt

We go through the handler lists and for each one determine if it's covered or not based on the coverage file.
We then attempt to determine which API the handler "belongs to" by examining the corresponding JavaScript code.

Note that the script is based on heuristics, rather than perfect parsing of the underlying code. Therefore the results
might not be 100% accurate.
"""
import argparse
import json
import os
import sys
import re


def _safe_path(file_path):
    """Resolve and validate that file_path stays within the working directory (CWE-73 guard)."""
    real = os.path.realpath(file_path)
    cwd = os.path.realpath(os.getcwd())
    if real != cwd and not real.startswith(cwd + os.sep):
        raise ValueError(
            'File path must be within the working directory: {!r}'.format(file_path)
        )
    return real


def get_function_coverage(coverage_file):
    """
    Get all covered and uncovered function names from an Istanbul coverage json file

    :param coverage_file: name of the coverage file
    :return: tuple(set_of_covered_functions, set_of_uncovered_functions)
    """
    coverage_as_json = None
    with open(_safe_path(coverage_file), 'r') as cf:
        coverage_as_json = json.load(cf)

    covered_functions = set()
    uncovered_functions = set()

    for fname in coverage_as_json.keys():
        per_file_coverage = coverage_as_json[fname]
        assert(len(per_file_coverage['fnMap']) == len(per_file_coverage['f']))
        for index, value in per_file_coverage['fnMap'].items():
            function_name = value['name']
            coverage_count = int(per_file_coverage['f'][index])
            if coverage_count > 0:
                covered_functions.add(function_name)
            else:
                uncovered_functions.add(function_name)

    uncovered_functions = uncovered_functions - covered_functions
    return covered_functions, uncovered_functions


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--coverage-file', '-c', default='out.json', help="output of Istanbul coverage report")
    parser.add_argument('--original_files', '-o', nargs='+', help="original .js files containing the API calls")
    parser.add_argument('handler_lists', nargs='+', help="files listing API handler function names, one name per line")
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_arguments()
    all_covered_functions, all_uncovered_functions = get_function_coverage(args.coverage_file)

    covered_handlers = set()
    uncovered_handlers = set()
    missing_handlers = set()

    # go through the list of API handler names and sort them into three sets
    # covered handlers, uncovered handler, and handlers for which the function name is not in the coverage file
    for file_name in args.handler_lists:
        print("Analyzing handler list {}".format(file_name))
        with open(_safe_path(file_name), 'r') as function_list_file:
            for line in function_list_file.read().split('\n'):
                if not line:
                    continue
                if line in all_covered_functions:
                    covered_handlers.add(line)
                elif line in all_uncovered_functions:
                    uncovered_handlers.add(line)
                else:
                    missing_handlers.add(line)

    print("Number of covered handlers: {}".format(len(covered_handlers)))
    print("Number of uncovered handlers: {}".format(len(uncovered_handlers)))
    print("Missing handlers: {}".format(missing_handlers))

    if not args.original_files:
        sys.exit(0)

    covered_apis = set()
    not_found_covered_apis = set()
    uncovered_apis = set()
    not_found_uncovered_apis = set()

    _covered_handlers = set()
    _uncovered_handlers = set()

    API_LINE_RE = re.compile(r"""
    \s*                # leading whitespace
    (?:async\s+){0,1}  # optional 'async'
    (\w*)              # API name
    (?:\:\s*){0,1}     # followed by possible ': '
    \(.*               # followed by ( and the rest
    """, re.VERBOSE)

    # go through the list of the original js files and try to get the API names by handler name
    # the heuristics we use are:
    #   - the handler line usually has 'return' in it
    #   - the line before the handler line may have '=>' in it
    #   - the first line before the handler line that matches API_LINE_RE regular expression contains the API name
    for file_name in args.original_files:
        print("Analyzing API file {}".format(file_name))
        with open(_safe_path(file_name), 'r') as api_file:
            lines = api_file.read().split('\n')
            for index in range(1, len(lines)):
                for handler_set, _handler_set, api_set in [
                    (covered_handlers, _covered_handlers, covered_apis),
                    (uncovered_handlers, _uncovered_handlers, uncovered_apis)
                ]:
                    for handler in handler_set:
                        if handler in lines[index] and ('return' in lines[index] or '=>' in lines[index-1]):
                            for _api_index in range(index-1, index-20, -1):  # search within previous 20 lines
                                match = API_LINE_RE.match(lines[_api_index])
                                if match:
                                    _handler_set.add(handler)
                                    api_set.add(match.group(1))
                                    break

                covered_handlers = covered_handlers - _covered_handlers
                uncovered_handlers = uncovered_handlers - _uncovered_handlers

    if uncovered_apis & covered_apis:
        print('-------- <APIs that are both covered and uncovered> -----------')
        for fname in uncovered_apis & covered_apis:
            if not fname.startswith('(anonymous'):
                print(fname)
        print('-------- </APIs that are both covered and uncovered> -----------')

    uncovered_apis = uncovered_apis - covered_apis

    print("Number of covered APIs: {}".format(len(covered_apis)))
    print("Number of uncovered APIs: {}".format(len(uncovered_apis)))

    print("\nList of uncovered APIs:")
    print("----------------------")
    for api_name in sorted(uncovered_apis):
        print(api_name)
    print("----------------------")

    if covered_handlers:
        print("Covered handlers for which no API was found: {}", covered_handlers)
    if uncovered_handlers:
        print("Uncovered handlers for which no API was found: {}", uncovered_handlers)