export type IntakeDepartment = {
  id: string;
  name: string;
};

export type IntakePosition = {
  id: string;
  title: string;
  departmentId: string | null;
  departmentName: string;
};
