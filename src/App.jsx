import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PortalLogin, PortalDashboard } from './portal'
import { SiteHome } from './site'
export default function App(){return <BrowserRouter><Routes><Route path="/" element={<SiteHome/>}/><Route path="/portal/login" element={<PortalLogin/>}/><Route path="/portal" element={<PortalDashboard/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></BrowserRouter>}
