/* eslint-disable */
// @ts-nocheck
import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as LoginRouteImport } from './routes/login'
import { Route as CasesRouteImport } from './routes/cases'
import { Route as CritiqueLibraryRouteImport } from './routes/critique-library'
import { Route as CtRouteImport } from './routes/ct'
import { Route as LabRouteImport } from './routes/lab'
import { Route as TestExposureRouteImport } from './routes/test-exposure'
const IndexRoute=IndexRouteImport.update({id:'/',path:'/',getParentRoute:()=>rootRouteImport}as any)
const LoginRoute=LoginRouteImport.update({id:'/login',path:'/login',getParentRoute:()=>rootRouteImport}as any)
const CasesRoute=CasesRouteImport.update({id:'/cases',path:'/cases',getParentRoute:()=>rootRouteImport}as any)
const CritiqueLibraryRoute=CritiqueLibraryRouteImport.update({id:'/critique-library',path:'/critique-library',getParentRoute:()=>rootRouteImport}as any)
const CtRoute=CtRouteImport.update({id:'/ct',path:'/ct',getParentRoute:()=>rootRouteImport}as any)
const LabRoute=LabRouteImport.update({id:'/lab',path:'/lab',getParentRoute:()=>rootRouteImport}as any)
const TestExposureRoute=TestExposureRouteImport.update({id:'/test-exposure',path:'/test-exposure',getParentRoute:()=>rootRouteImport}as any)
export interface FileRoutesByFullPath{'/':typeof IndexRoute;'/login':typeof LoginRoute;'/cases':typeof CasesRoute;'/critique-library':typeof CritiqueLibraryRoute;'/ct':typeof CtRoute;'/lab':typeof LabRoute;'/test-exposure':typeof TestExposureRoute}
export interface FileRoutesByTo extends FileRoutesByFullPath{}
export interface FileRoutesById{__root__:typeof rootRouteImport;'/':typeof IndexRoute;'/login':typeof LoginRoute;'/cases':typeof CasesRoute;'/critique-library':typeof CritiqueLibraryRoute;'/ct':typeof CtRoute;'/lab':typeof LabRoute;'/test-exposure':typeof TestExposureRoute}
export interface FileRouteTypes{fileRoutesByFullPath:FileRoutesByFullPath;fullPaths:'/'|'/login'|'/cases'|'/critique-library'|'/ct'|'/lab'|'/test-exposure';fileRoutesByTo:FileRoutesByTo;to:'/'|'/login'|'/cases'|'/critique-library'|'/ct'|'/lab'|'/test-exposure';id:'__root__'|'/'|'/login'|'/cases'|'/critique-library'|'/ct'|'/lab'|'/test-exposure';fileRoutesById:FileRoutesById}
export interface RootRouteChildren{IndexRoute:typeof IndexRoute;LoginRoute:typeof LoginRoute;CasesRoute:typeof CasesRoute;CritiqueLibraryRoute:typeof CritiqueLibraryRoute;CtRoute:typeof CtRoute;LabRoute:typeof LabRoute;TestExposureRoute:typeof TestExposureRoute}
declare module '@tanstack/react-router'{interface FileRoutesByPath{'/':{id:'/';path:'/';fullPath:'/';preLoaderRoute:typeof IndexRouteImport;parentRoute:typeof rootRouteImport};'/login':{id:'/login';path:'/login';fullPath:'/login';preLoaderRoute:typeof LoginRouteImport;parentRoute:typeof rootRouteImport};'/cases':{id:'/cases';path:'/cases';fullPath:'/cases';preLoaderRoute:typeof CasesRouteImport;parentRoute:typeof rootRouteImport};'/critique-library':{id:'/critique-library';path:'/critique-library';fullPath:'/critique-library';preLoaderRoute:typeof CritiqueLibraryRouteImport;parentRoute:typeof rootRouteImport};'/ct':{id:'/ct';path:'/ct';fullPath:'/ct';preLoaderRoute:typeof CtRouteImport;parentRoute:typeof rootRouteImport};'/lab':{id:'/lab';path:'/lab';fullPath:'/lab';preLoaderRoute:typeof LabRouteImport;parentRoute:typeof rootRouteImport};'/test-exposure':{id:'/test-exposure';path:'/test-exposure';fullPath:'/test-exposure';preLoaderRoute:typeof TestExposureRouteImport;parentRoute:typeof rootRouteImport}}}
const rootRouteChildren:RootRouteChildren={IndexRoute,LoginRoute,CasesRoute,CritiqueLibraryRoute,CtRoute,LabRoute,TestExposureRoute}
export const routeTree=rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()
import type {getRouter} from './router.tsx'
declare module '@tanstack/react-start'{interface Register{ssr:true;router:Awaited<ReturnType<typeof getRouter>>}}
