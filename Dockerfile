# Start with debian
FROM alpine:latest

# Set working directory
WORKDIR /app

# Copy files in at /app
COPY . .

# Update and upgrade packages
RUN apk update
RUN apk upgrade

# Install Node, yarn
RUN apk add --update nodejs
RUN apk add --update yarn

# Install packages
RUN yarn install

# Expose Node.js app port
EXPOSE 80

CMD ["yarn", "start"]