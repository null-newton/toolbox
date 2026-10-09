export interface AppAccess {
  app_id: string
  allowed: boolean
  max_bytes: number | null
  used_bytes: number
}
export interface AccountAccess {
  role: 'free' | 'pro' | 'master'
  suspended: boolean
  apps: AppAccess[]
}
