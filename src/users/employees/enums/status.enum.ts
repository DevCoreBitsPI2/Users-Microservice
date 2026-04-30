export enum status_enum {
  active = 'active',
  inactive = 'inactive',
  suspended = 'suspended',
  retired = 'retired',
  invited = 'invited',
}


export const StatusEmployeeListDto = [
    status_enum.active,
    status_enum.inactive,
    status_enum.suspended,
    status_enum.retired,
    status_enum.invited
]