/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as LoginRouteImport } from './routes/login'
import { Route as CasesRouteImport } from './routes/cases'
import { Route as LabRouteImport } from './routes/lab'
import { Route as TestExposureRouteImport } from './routes/test-exposure'

const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const LoginRoute = LoginRouteImport.update({ id: '/login', path: '/login', getParentRoute: () => rootRouteImport } as any)
const CasesRoute = CasesRouteImport.update({ id: '/cases', path: '/cases', getParentRoute: () => rootRouteImport } as any)
const LabRoute = LabRouteImport.update({ id: '/lab', path: '/lab', getParentRoute: () => rootRouteImport } as any)
const TestExposureRoute = TestExposureRouteImport.update({ id: '/test-exposure', path: '/test-exposure', getParentRoute: () => rootRouteImport } as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/cases': typeof CasesRoute
  '/lab': typeof LabRoute
  '/test-exposure': typeof TestExposureRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/cases': typeof CasesRoute
  '/lab': typeof LabRoute
  '/test-exposure': typeof TestExposureRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/cases': typeof CasesRoute
  '/lab': typeof LabRoute
  '/test-exposure': typeof TestExposureRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/login' | '/cases' | '/lab' | '/test-exposure'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/login' | '/cases' | '/lab' | '/test-exposure'
  id: '__root__' | '/' | '/login' | '/cases' | '/lab' | '/test-exposure'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  LoginRoute: typeof LoginRoute
  CasesRoute: typeof CasesRoute
  LabRoute: typeof LabRoute
  TestExposureRoute: typeof TestExposureRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/login': { id: '/login'; path: '/login'; fullPath: '/login'; preLoaderRoute: typeof LoginRouteImport; parentRoute: typeof rootRouteImport }
    '/cases': { id: '/cases'; path: '/cases'; fullPath: '/cases'; preLoaderRoute: typeof CasesRouteImport; parentRoute: typeof rootRouteImport }
    '/lab': { id: '/lab'; path: '/lab'; fullPath: '/lab'; preLoaderRoute: typeof LabRouteImport; parentRoute: typeof rootRouteImport }
    '/test-exposure': { id: '/test-exposure'; path: '/test-exposure'; fullPath: '/test-exposure'; preLoaderRoute: typeof TestExposureRouteImport; parentRoute: typeof rootRouteImport }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute,
  LoginRoute,
  CasesRoute,
  LabRoute,
  TestExposureRoute,
}
export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register { ssr: true; router: Awaited<ReturnType<typeof getRouter>> }
}
