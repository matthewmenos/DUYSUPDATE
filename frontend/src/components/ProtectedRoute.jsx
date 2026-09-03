import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import Layout from './Layout';

function ProtectedRoute() {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default ProtectedRoute;
