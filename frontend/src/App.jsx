// src/App.jsx
import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import PrivateRoute from "./components/PrivateRoute";
import { Link } from "react-router-dom";
import { CallProvider } from "./contexts/CallContext";

export default function App() {
  return (
    <CallProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
  <Route path="/*" element={<PrivateRoute><Chat /></PrivateRoute>} />
      </Routes>
    </CallProvider>
  );
}

function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-3xl font-bold mb-4">Welcome to ChatApp</h1>
      <p className="text-gray-600">A modern chat application built with the MERN stack.</p>

      <div className="mt-6 space-x-4">
        <Link to="/login" className="px-4 py-2 bg-blue-500 text-white rounded-lg">
          Login
        </Link>
        <Link to="/register" className="px-4 py-2 bg-green-500 text-white rounded-lg">
          Register
        </Link>
      </div>
    </div>
  );
}
