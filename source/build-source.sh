# Builds Docker images for the Mythical source code.
# This assumes:
#  * That an authenticated Docker client is available for the appropriate target registry.
#  * That the Docker client is configured to use buildx.
registryName=$1
version=$2

# Ensure we have both parameters.
if [ -z "$registryName" ] || [ -z "$version" ]
then
    echo "Usage: build-source.sh <registryName> <version>"
    exit 1
fi

# Build'n'push
docker buildx build --build-arg SERVICE=mythical-beasts-requester -f ./source/docker/Dockerfile -t ${registryName}:mythical-beasts-requester-${version} -t ${registryName}:mythical-beasts-requester-latest --platform linux/amd64,linux/arm64 --push source/
docker buildx build --build-arg SERVICE=mythical-beasts-server -f ./source/docker/Dockerfile -t ${registryName}:mythical-beasts-server-${version} -t ${registryName}:mythical-beasts-server-latest --platform linux/amd64,linux/arm64 --push source/
docker buildx build --build-arg SERVICE=mythical-beasts-recorder -f ./source/docker/Dockerfile -t ${registryName}:mythical-beasts-recorder-${version} -t ${registryName}:mythical-beasts-recorder-latest --platform linux/amd64,linux/arm64 --push source/
