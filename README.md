📈 InvestorOS

A Stock Market Research and Investment Simulation Platform

InvestorOS is a web-based investment platform developed as a university project. It brings together stock market research, portfolio tracking, watchlist management, paper trading, and investment journaling in a single interface.

The project demonstrates the use of frontend web technologies, backend development, database integration, and user authentication.

✨ Features

- Market Dashboard — Explore available stocks and view their prices and price changes.
- Market Research — Examine sample financial fundamentals and valuation metrics for selected companies.
- Stock Comparison — Compare financial metrics of different companies.
- Stock Price Charts — Visualize illustrative historical stock price movements.
- Watchlist — Keep track of selected stocks.
- Portfolio Management — Monitor portfolio holdings and investment transactions.
- Paper Trading — Simulate buying and selling stocks using virtual money without placing real orders.
- Investment Journal — Record and review investment notes.
- User Authentication — Register, log in, and manage authenticated sessions.
- Feedback System — Submit ratings, suggestions, and feedback.
- Settings & About — Access application settings and project information.

🛠️ Technologies Used

Technology| Purpose
HTML5| Webpage structure
CSS3| Styling and responsive interface
JavaScript| Frontend functionality and interactions
Node.js| Backend runtime
Express.js| Backend server and API routes
MySQL| Relational database
mysql2| Node.js–MySQL connectivity
bcryptjs| Password hashing
express-session| Session-based authentication
dotenv| Environment variable configuration

🏗️ Project Architecture

InvestorOS follows a client-server architecture.

- Frontend: Provides the user interface and handles user interactions.
- Backend: Processes API requests, authentication, and application logic.
- Database: Stores application data, including user accounts and relevant transaction and feedback records.

The frontend communicates with the backend through HTTP API endpoints, while the backend interacts with the MySQL database.

🚀 Getting Started

Prerequisites

Install the following software:

- "Node.js" (https://nodejs.org/)
- "MySQL" (https://www.mysql.com/)

Git is recommended for version control.

Installation

1. Clone the repository

git clone <YOUR_REPOSITORY_URL>
cd InvestorOS

Alternatively, download the repository as a ZIP file and extract it.

2. Install dependencies

npm install

3. Configure environment variables

Create a ".env" file in the project root and configure the required database connection settings and session secret according to the application's server configuration.

Do not commit ".env" files or expose database credentials and session secrets.

4. Configure the database

Create the required MySQL database and tables using the project's database schema or setup instructions.

Ensure the database connection settings match your local MySQL configuration.

5. Start the application

node server.js

6. Open the application

Visit:

http://localhost:3000

The application should now be accessible locally, provided the database and environment variables are configured correctly.

📊 Data & Limitations

InvestorOS is an educational demonstration project.

- Stock price history is illustrative and should not be interpreted as verified historical market data.
- Sample financial fundamentals are provided for demonstration purposes.
- Paper trading uses virtual money and does not execute real stock market orders.
- The platform is not intended to provide financial advice or execute real investments.

🔐 Security

The application implements password hashing and session-based authentication.

Environment variables are used to configure sensitive settings. Production deployment should also account for secure cookie configuration, database access controls, HTTPS, and other appropriate security measures.

🎓 Project Purpose

InvestorOS was developed to demonstrate practical applications of web development, REST-style API communication, database management, authentication, and interactive financial interfaces.

The project combines these concepts into a single educational investment platform.

👥 Contributors

Developed as a collaborative university project.

Add contributor names here.

## License

InvestorOS is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 InvestorOS contributors.
