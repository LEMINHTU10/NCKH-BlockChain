FROM node:20-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Expose Vite's default port
EXPOSE 5173

# Run the host script which enables --host to allow external access
CMD ["npm", "run", "host"]
