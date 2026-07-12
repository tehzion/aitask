import { User, Project, Task } from '../types';
import { addDays, subDays, format } from 'date-fns';
import { DEFAULT_USER_PASSWORD } from '../lib/auth';

const today = new Date();

export const mockUsers: User[] = [
  // Boss
  { id: 'u-boss', name: 'Boss Koo', password: DEFAULT_USER_PASSWORD, role: 'Admin', department: 'Management', isSuperAdmin: true, avatar: 'https://i.pravatar.cc/150?u=BossKoo' },
  { id: 'u-adminmojo', name: 'adminmojo', password: 'Mojo2026@', role: 'Admin', department: 'Management', isSuperAdmin: true, avatar: 'https://i.pravatar.cc/150?u=adminmojo' },
  
  // Demos
  { id: 'u-admin', name: 'Admin Demo', password: DEFAULT_USER_PASSWORD, role: 'Admin', department: 'Operation', avatar: 'https://i.pravatar.cc/150?u=AdminDemo' },
  { id: 'u-staff', name: 'Staff Demo', password: DEFAULT_USER_PASSWORD, role: 'Staff', department: 'Designer', avatar: 'https://i.pravatar.cc/150?u=StaffDemo' },
  { id: 'u-finance', name: 'Finance Demo', password: DEFAULT_USER_PASSWORD, role: 'Staff', department: 'Account & Finance', avatar: 'https://i.pravatar.cc/150?u=FinanceDemo' },
  { id: 'u-client-urban', name: 'UrbanEats Client Demo', password: DEFAULT_USER_PASSWORD, role: 'Client', department: 'Client', companyName: 'UrbanEats', avatar: 'https://i.pravatar.cc/150?u=UrbanEatsClient' },
];

export const mockProjects: Project[] = [
  {
    id: 'p1',
    clientName: 'TechNova',
    projectName: 'Q3 Brand Awareness',
    services: ['Social Media', 'Design', 'Ads'],
    startDate: format(today, 'yyyy-MM-dd'),
    deadline: format(addDays(today, 30), 'yyyy-MM-dd'),
    totalTasks: 0,
    completedTasks: 0,
  },
  {
    id: 'p2',
    clientName: 'EcoLife',
    projectName: 'Website Revamp',
    services: ['Website', 'SEO', 'Design'],
    startDate: format(subDays(today, 10), 'yyyy-MM-dd'),
    deadline: format(addDays(today, 15), 'yyyy-MM-dd'),
    totalTasks: 0,
    completedTasks: 0,
  },
  {
    id: 'p3',
    clientName: 'UrbanEats',
    projectName: 'Promo Video Campaign',
    services: ['Video', 'Social Media'],
    startDate: format(subDays(today, 5), 'yyyy-MM-dd'),
    deadline: format(addDays(today, 5), 'yyyy-MM-dd'),
    totalTasks: 0,
    completedTasks: 0,
  }
];

export const legacyDemoTaskIds = ['T-1001', 'T-1002', 'T-1003', 'T-1004', 'T-1005', 'T-1006', 'T-1007', 'T-1008'];

export const mockTasks: Task[] = [];
