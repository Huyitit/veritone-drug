#!/bin/bash
set -x
environment="${ENVIRONMENT}"
name="${APPLICATION}"

if [ "core-graphql-server" == "$name" ]; then
    infralib="core-infrastructure-lib"
fi

# AWS_STS_ACCOUNT_ID="${AWS_STS_ACCOUNT_ID}" # this one we will need to install aws cli to get info

binaries_endpoint="binaries-lb.aws-${environment}.veritone.com"
vpc_dns_zone_name="aws-${environment}.veritone.com"

GLOBAL_BASE_URL="http://${binaries_endpoint}/conf/global/base.json"
GLOBAL_APP_URL="http://${binaries_endpoint}/conf/global/${name}.json"
ENV_BASE_URL="http://${binaries_endpoint}/conf/aws-${environment}/base.json"
ENV_APP_URL="http://${binaries_endpoint}/conf/aws-${environment}/${name}.json"
if [ "core-graphql-server" == "$name" ]; then
    GLOBAL_LIB_URL="http://${binaries_endpoint}/conf/global/${infralib}.json"
    ENV_LIB_URL="http://${binaries_endpoint}/conf/aws-${environment}/${infralib}.json"
fi

if echo "${environment}" | grep -E "^[A-Za-z]{3,4}[0-9]{1,2}-.*" &> /dev/null; then
    binaries_endpoint="binaries.${environment//-/.}.veritone.com"
    vpc_dns_zone_name="${environment//-/.}.veritone.com"
    
    GLOBAL_BASE_URL="http://${binaries_endpoint}/conf/global/base.json"
    GLOBAL_APP_URL="http://${binaries_endpoint}/conf/global/${name}.json"
    ENV_BASE_URL="http://${binaries_endpoint}/conf/${environment}/base.json"
    ENV_APP_URL="http://${binaries_endpoint}/conf/${environment}/${name}.json"

    if [ "core-graphql-server" == "$name" ]; then
        GLOBAL_LIB_URL="http://${binaries_endpoint}/conf/global/${infralib}.json"
        ENV_LIB_URL="http://${binaries_endpoint}/conf/${environment}/${infralib}.json"
    fi
fi

echo "GLOBAL_BASE_URL=${GLOBAL_BASE_URL}"
echo "GLOBAL_APP_URL=${GLOBAL_APP_URL}"
echo "ENV_BASE_URL=${ENV_BASE_URL}"
echo "ENV_APP_URL=${ENV_APP_URL}"

# Download config files
# Only retry global base since it's guaranteed to be there
curl --retry 5 --retry-delay 2 ${GLOBAL_BASE_URL} --output /tmp/global_base.json
curl ${GLOBAL_APP_URL} --output /tmp/global_${name}.json
curl ${ENV_BASE_URL} --output /tmp/${environment}_base.json
curl ${ENV_APP_URL} --output /tmp/${environment}_${name}.json

if [ "core-graphql-server" == "$name" ]; then
    curl ${GLOBAL_LIB_URL} --output /tmp/global_${infralib}.json
    curl ${ENV_LIB_URL} --output /tmp/${environment}_${infralib}.json
fi

# Verify each config is valid json, if not repalce with empty json {}
declare -a configFiles=(
    /tmp/global_base.json
    /tmp/global_${name}.json
    /tmp/${environment}_base.json
    /tmp/${environment}_${name}.json
)
for file in "${configFiles[@]}"; do
    echo "Checking if $file contains valid json."
    jq . ${file} >/dev/null 2>&1 || {
        echo "Invalid json found in $file, replacing with {}" ;
        echo "{}" >${file} ;
    }
done

if [ "core-graphql-server" == "$name" ]; then
    # Verify each config is valid json, if not repalce with empty json {}
    declare -a infralibConfigFiles=(
        /tmp/global_base.json
        /tmp/global_${infralib}.json
        /tmp/${environment}_base.json
        /tmp/${environment}_${infralib}.json
    )
    for file in "${infralibConfigFiles[@]}"; do
        echo "Checking if $file contains valid json."
        jq . ${file} >/dev/null 2>&1 || {
            echo "Invalid json found in $file, replacing with {}" ;
            echo "{}" >${file} ;
        }
    done
fi

echo "Retrieving publicDnsZoneName from environment base config"
public_dns_zone_name=$(cat /tmp/${environment}_base.json | jq '.publicDnsZoneName' | tr -d '" ')
public_dns_zone_name2=$(cat /tmp/${environment}_base.json | jq '.publicDnsZoneName2' | tr -d '" ') || echo "No public_dns_zone_name2 found"

echo "Combining config to /app/config.json"
# Combine configs, globalBase ---> globalApp ---> envBase ---> envApp
jq -s '.[0] * .[1] * .[2] * .[3]' \
    "${configFiles[@]}" > /app/config.json.in

if [ "core-graphql-server" == "$name" ]; then
    echo "Combining infralib config to /app/dal/config.infralib.json"
    # Combine configs, globalBase ---> globalLib ---> envBase ---> envLib
    jq -s '.[0] * .[1] * .[2] * .[3]' \
        "${infralibConfigFiles[@]}" > /app/dal/config.infralib.json.in
fi

template_file () {
    [[ -f $1 ]] || return 0
    # copy all permissions from template.in -> rendered_file:
    cp -p $1 ${1%%.in}

    # NOTE: quote styles here are mixed based on need:
    sed -e "s/@@INTERNAL_DNS_ZONE@@/${vpc_dns_zone_name}/" \
             -e "s/@@EXTERNAL_DNS_ZONE@@/${public_dns_zone_name}/" \
	     -e "s/@@EXTERNAL_DNS_ZONE2@@/${public_dns_zone_name2}/" \
             -e "s/@@ENVIRONMENT@@/${environment}/" \
             -e "s/@@AWS_STS_ACCOUNT_ID@@/${AWS_STS_ACCOUNT_ID}/" \
	     $1 > ${1%%.in}
}

template_file /app/config.json.in

if [ "core-graphql-server" == "$name" ]; then
    template_file /app/dal/config.infralib.json.in
fi

echo "Final /app/config.json built"
