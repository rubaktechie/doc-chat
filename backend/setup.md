# Install Dependencies
npm install

# Create env file
cp .env.example .env

# Setup Python Service
Follow the instructions in  the [Python Directory](./python/setup.md) to setup the Python service.

# Run the backend server
npm run dev # Creates all necessary tables in sqlite and created all necessary folders for the backend server to run. This command will also start the backend server.

Server will be running at http://localhost:3001