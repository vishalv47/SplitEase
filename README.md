# SplitEase 💰

A modern, intuitive expense splitting application built with React and Supabase. Split bills, track shared expenses, and settle up with friends seamlessly.

## ✨ Features

- **Group Management**: Create and manage expense groups with friends
- **Expense Tracking**: Record and categorize shared expenses
- **Smart Balance Calculation**: Automatically calculate who owes whom
- **Real-time Updates**: Live synchronization of expenses and balances
- **User Authentication**: Secure signup and login with Supabase Auth
- **Responsive Design**: Works perfectly on desktop and mobile devices
- **Settlement Tracking**: Record payments and settle debts

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm installed ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- A Supabase account and project ([create one here](https://supabase.com))

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/vishalv47/SplitEase.git
cd SplitEase
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

4. **Start the development server**
```bash
npm run dev
```

The app will be available at `http://localhost:8080`

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **React Router** - Client-side routing
- **TanStack Query** - Server state management

### UI Components
- **shadcn/ui** - Beautiful, accessible components
- **Radix UI** - Unstyled, accessible component primitives
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library

### Backend & Database
- **Supabase** - Backend as a Service
  - PostgreSQL database
  - Authentication
  - Real-time subscriptions
  - Row Level Security (RLS)

### Form & Validation
- **React Hook Form** - Form state management
- **Zod** - Schema validation
- **date-fns** - Date utilities

## 📁 Project Structure

```
SplitEase/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── ui/           # shadcn/ui components
│   │   └── layout/       # Layout components
│   ├── pages/            # Page components (routes)
│   ├── hooks/            # Custom React hooks
│   ├── integrations/     # Supabase client and types
│   ├── services/         # Business logic layer
│   ├── repositories/     # Data access layer
│   ├── lib/              # Utility functions
│   └── types/            # TypeScript type definitions
├── public/               # Static assets
└── supabase/            # Supabase migrations and config
```

## 🗄️ Database Schema

- **profiles**: User profile information
- **groups**: Expense sharing groups
- **group_members**: Group membership with roles
- **expenses**: Individual expense records
- **expense_splits**: How expenses are divided
- **settlements**: Payment records between users

## 📜 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🔐 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anonymous key | Yes |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 👤 Author

**Vishal**
- GitHub: [@vishalv47](https://github.com/vishalv47)

## 🙏 Acknowledgments

- Built with [shadcn/ui](https://ui.shadcn.com/) components
- Icons from [Lucide](https://lucide.dev/)
- Powered by [Supabase](https://supabase.com/)

---

Made with ❤️ for easier expense splitting
