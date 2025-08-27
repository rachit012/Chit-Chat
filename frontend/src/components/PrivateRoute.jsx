import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import api from "../utils/api";

const PrivateRoute = ({ children }) => {
  const [isValid, setIsValid] = useState(null);
  const location = useLocation();
  const token = localStorage.getItem("accessToken");

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsValid(false);
        return;
      }

      try {
        await api.get("/auth/verify");
        setIsValid(true);
      } catch (err) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        setIsValid(false);
      }
    };

    verifyToken();
  }, [token]);

  if (isValid === null) {
    return <div>Loading...</div>;
  }

  return isValid ? children : <Navigate to="/login" state={{ from: location }} replace />;
};

export default PrivateRoute;