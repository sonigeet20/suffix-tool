# URL Tracker - Local Deployment Guide

## Project Overview
A URL tracking application with offer management, analytics, and user authentication built with React, TypeScript, Vite, and Supabase.

## Prerequisites
- Node.js (version 18 or higher)
- npm (comes with Node.js)
- A Supabase account (already configured)

## Quick Start

### 1. Download/Clone the Project
If you're downloading from a ZIP file, extract it to your desired location.

### 2. Install Dependencies
Open a terminal in the project directory and run:
```bash
npm install
```

### 3. Environment Configuration
The `.env` file is already configured with your Supabase credentials:
- Supabase URL: https://rfhuqenntxiqurplenjn.supabase.co
- Database and authentication are pre-configured

### 4. Run the Development Server
```bash
npm run dev
```

The application will start at `http://localhost:5173`

### 5. Build for Production
To create a production build:
```bash
npm run build
```

The built files will be in the `dist` folder.

### 6. Preview Production Build
To preview the production build locally:
```bash
npm run preview
```

## Project Structure
```
url-tracker/
├── src/
│   ├── components/       # React components
│   │   ├── Login.tsx     # Authentication
│   │   ├── OfferForm.tsx # Create/edit offers
│   │   ├── OfferList.tsx # Display offers
│   │   ├── Analytics.tsx # Statistics and charts
│   │   └── Settings.tsx  # User settings
│   ├── lib/
│   │   └── supabase.ts   # Supabase client configuration
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Application entry point
├── supabase/
│   ├── migrations/       # Database migrations
│   └── functions/        # Edge functions
├── .env                  # Environment variables
└── package.json          # Project dependencies
```

## Features
- User authentication (email/password)
- Offer management (create, edit, delete)
- URL tracking with custom suffixes
- Analytics dashboard
- Automatic data cleanup (30-day retention)
- Statistics tracking

## Database
The database is hosted on Supabase with:
- Users table (managed by Supabase Auth)
- Offers table (stores your tracking offers)
- Row Level Security enabled for data protection
- Automatic cleanup of old data

## Troubleshooting

### Port Already in Use
If port 5173 is already in use, Vite will automatically try the next available port.

### Build Errors
Make sure all dependencies are installed:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Connection Issues
Verify your internet connection - the app requires connectivity to Supabase.

## Deployment Options

### Option 1: Vercel (Recommended)
1. Install Vercel CLI: `npm install -g vercel`
2. Run: `vercel`
3. Follow the prompts

### Option 2: Netlify
1. Install Netlify CLI: `npm install -g netlify-cli`
2. Run: `netlify deploy`
3. For production: `netlify deploy --prod`

### Option 3: Static File Hosting
1. Build the project: `npm run build`
2. Upload the `dist` folder to any static hosting service:
   - GitHub Pages
   - AWS S3
   - Google Cloud Storage
   - Any web server

## Support
For issues with:
- Supabase: Check the Supabase dashboard at https://supabase.com/dashboard
- Application bugs: Review the browser console for errors
- Build issues: Ensure Node.js version is 18+

## Technology Stack
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Supabase (Database + Auth)
- React Router
- Lucide Icons
