#!/bin/sh
code=$(curl --silent --write-out '%{http_code}' --output /dev/null --retry 5 --retry-max-time 30 --retry-connrefused -X POST \
    -H "Content-Type: application/json" --url http://grafana:3000/api/datasources \
    --data '{"id":2,"uid":"tempo","orgId":1,"name":"Tempo","type":"tempo","typeName":"Tempo","typeLogoUrl":"public/app/plugins/datasource/tempo/img/tempo_logo.svg","access":"proxy","url":"http://tempo:3200","user":"","database":"","basicAuth":false,"isDefault":false,"jsonData":{"nodeGraph":{"enabled":true},"serviceMap":{"datasourceUid":"Mimir"},"tracesToLogs":{"datasourceUid":"loki","filterByTraceID":false,"spanEndTimeShift":"500ms","spanStartTimeShift":"-500ms","tags":["beast"]}},"readOnly":true}')
if [ $code -eq 200 ]; then
    echo "Data source created, creating correlations"
    curl --silent --retry 5 --output /dev/null --retry-max-time 30 --retry-connrefused -X POST \
    -H "Content-Type: application/json" --url http://grafana:3000/api/datasources/uid/tempo/correlations \
    --data "{\"targetUID\":\"postgres\",\"label\":\"Count \$beast in table\",\"description\":\"Counts the number of beasts in a particular table\",\"config\":{\"type\":\"query\",\"field\":\"tags\",\"target\":{\"editorMode\":\"code\",\"filters\":[{\"operator\":\"=\",\"scope\":\"span\"}],\"format\":\"table\",\"limit\":20,\"queryType\":\"traceqlSearch\",\"rawQuery\":true,\"rawSql\":\"SELECT COUNT(*) FROM \$beast;\",\"refId\":\"A\",\"sql\":{\"columns\":[{\"parameters\":[],\"type\":\"function\"}],\"groupBy\":[{\"property\":{\"type\":\"string\"},\"type\":\"groupBy\"}],\"limit\":50}},\"transformations\":[{\"type\":\"regex\",\"expression\":\".*{\\\"value\\\":\\\"(.*?)\\\",\\\"key\\\":\\\"beast\\\".*}\",\"mapValue\":\"beast\"}]}}"
    curl --silent --retry 5 --output /dev/null --retry-max-time 30 --retry-connrefused -X POST \
    -H "Content-Type: application/json" --url http://grafana:3000/api/datasources/uid/tempo/correlations \
    --data "{\"targetUID\":\"postgres\",\"label\":\"\$statement\",\"description\":\"Runs the found DB statement in the span\",\"config\":{\"type\":\"query\",\"field\":\"tags\",\"target\":{\"editorMode\":\"code\",\"filters\":[{\"operator\":\"=\",\"scope\":\"span\"}],\"format\":\"table\",\"limit\":20,\"queryType\":\"traceqlSearch\",\"rawQuery\":true,\"rawSql\":\"\$statement;\",\"refId\":\"A\",\"sql\":{\"columns\":[{\"parameters\":[],\"type\":\"function\"}],\"groupBy\":[{\"property\":{\"type\":\"string\"},\"type\":\"groupBy\"}],\"limit\":50}},\"transformations\":[{\"type\":\"regex\",\"expression\":\".*{\\\"value\\\":\\\"(.*?)\\\",\\\"key\\\":\\\"db.statement\\\".*}\",\"mapValue\":\"statement\"}]}}"
else
    echo "Data source already exists"
fi
