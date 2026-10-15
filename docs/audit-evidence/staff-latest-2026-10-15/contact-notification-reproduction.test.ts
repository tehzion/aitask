import { test, expect } from 'vitest';
import { useStore } from './index';
import { taskWorkContactId } from '../lib/staffWorkflow';
import type { User,Task } from '../types';
test('review update reaches the HOD shown as task contact',()=>{
  const old=useStore.getState();
  const staff:User={id:'audit-worker',name:'Worker',role:'Staff',departments:['Designer']};
  const hod:User={id:'audit-contact',name:'Task Contact HOD',role:'HOD',departments:['Designer']};
  const pm:User={id:'audit-pm',name:'PM',role:'Project Manager',departments:[]};
  const task:Task={id:'audit-task',title:'Contact review enquiry',clientName:'Audit Company',serviceType:'Design',description:'',department:'Designer',assignedTo:staff.id,assignedBy:hod.id,createdBy:pm.id,startDate:'2026-10-01',dueDate:'2026-10-15',status:'Waiting Approval',priority:'Medium',isCompleted:false,completionPercentage:60,revisionCount:0,clientApprovalStatus:'Pending',isRecurring:false,visibility:'internal'};
  useStore.setState({currentUser:staff,users:[staff,hod,pm],tasks:[task],clients:[],projects:[],notifications:[],rolePermissions:[],backend:{...old.backend,mode:'local',status:'local',hasLocalChanges:false,pendingMutations:0}});
  expect(taskWorkContactId(task)).toBe(hod.id);
  expect(useStore.getState().addComment(task.id,'Please share a review update.').ok).toBe(true);
  console.log('Review-enquiry recipients:',useStore.getState().notifications.map(n=>n.targetUserId));
  expect(useStore.getState().notifications.some(n=>n.targetUserId===hod.id)).toBe(true);
  useStore.setState(old,true);
});
