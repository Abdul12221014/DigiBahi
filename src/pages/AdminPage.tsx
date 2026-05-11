import React from 'react';
import useRole from '@/hooks/useRole';
import AccessDenied from '@/components/AccessDenied';
import RoleManager from '@/components/RoleManager';
import AuditLogView from '@/components/AuditLogView';

const AdminPage: React.FC = () => {
  const canView = useRole(['owner']);
  if (!canView) return <AccessDenied/>;
  return (
    <div className="space-y-6">
      <div className="border rounded p-4">
        <h2 className="font-semibold mb-3">Role Management</h2>
        <RoleManager/>
      </div>
      <div className="border rounded p-4">
        <h2 className="font-semibold mb-3">Audit Logs</h2>
        <AuditLogView/>
      </div>
    </div>
  );
};

export default AdminPage;


