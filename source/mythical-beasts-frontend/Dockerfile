# Build stage
FROM node:18-alpine AS build

# Accept build arguments (only keep API URL for build-time configuration)
ARG REACT_APP_API_URL

# Set as environment variables for the build process
ENV REACT_APP_API_URL=$REACT_APP_API_URL

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies needed for build)
RUN npm ci

# Copy source code
COPY . .

# Build the React app with rsbuild
RUN npm run build

# Production stage
FROM nginx:alpine@sha256:62ff2089abf5a9ed33bd232895bef5e22f7bb4b200675cec49a5ebc48e3d4ac8

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built app from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
