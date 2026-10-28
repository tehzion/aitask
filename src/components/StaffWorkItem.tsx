import React from 'react';
import type { Task, User } from '../types';
import { TaskCard } from './TaskCard';

interface StaffWorkItemProps {
  task: Task;
  allTasks: Task[];
  users?: User[];
  onOpen: (task: Task) => void;
  emphasized?: boolean;
}

// Staff, HOD and PM queues share the same task card as the Super Admin list.
const StaffWorkItem: React.FC<StaffWorkItemProps> = props => <TaskCard {...props} />;

export default StaffWorkItem;
