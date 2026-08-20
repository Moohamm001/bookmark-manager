FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* at BUILD time, not run time — so these are build args. They are
# public identifiers (a PKCE public client has no secret); never put a secret here, it
# would end up in the shipped bundle.
ARG VITE_AUTH0_DOMAIN=dev-yg.us.auth0.com
ARG VITE_AUTH0_CLIENT_ID=H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA
ARG VITE_AUTH0_AUDIENCE=https://bbl-candidate-test-api
ARG VITE_AUTH0_REDIRECT_URI=http://localhost:3000/callback
ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN \
    VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID \
    VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE \
    VITE_AUTH0_REDIRECT_URI=$VITE_AUTH0_REDIRECT_URI \
    VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
