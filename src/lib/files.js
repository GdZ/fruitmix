import fs from 'fs'
import path from 'path'

import validator from 'validator'
import mkdirp from 'mkdirp'
import rimraf from 'rimraf'

import { readXstats, readXstatsAsync, updateXattrPermissionAsync } from './xstats'
import { Node, MapTree } from './maptree'

const driveDir = (root) => path.join(root, 'drive')
const libraryDir = (root) => path.join(root, 'library')
const updateDir = (root) => path.join(root, 'uploads')
const thumbDir = (root) => path.join(root, 'thumb')

const predefinedDirs = (root) => [
  root, 
  driveDir(root),
  libraryDir(root),
  uploadDir(root),
  thumbDir(root)
]

async function mkdirpAsync(dirpath) {
  return new Promise(resolve => 
    mkdirp(dirpath, err => 
      err ? resolve(err) : resolve(null)))
}

async function fsReaddirAsync(dirpath) {
  return new Promise(resolve => 
    fs.readdir(dirpath, (err, files) => 
      err ? resolve(err) : resolve(files)))
}

async function initMkdirs(root) {
  let predefined = predefiendDirs(root) 
  for (let i = 0; i < predefined.length; i++) {
    await mkdirpAsync(predefined[i])
  }
}

const validateOwner = (owner, uuid) =>
  (owner && Array.isArray(owner) && owner.length === 1 && owner[0] === uuid)

const validateUserList = (list) => 
  (list && Array.isArray(list) && list.every(w => validator.isUUID(w)))

async function checkDriveXstat(rootpath, uuid) {

  let drivePath = path.join(rootpath, uuid)
  let mix = {
    owner: [uuid],
    writelist: [],
    readlist: [],
  }

  let x = await readXstatsAsync(drivePath, mix)
  let { owner, writelist, readlist } = x

  if (validateOwner(owner) &&
      validateList(writelist) &&
      validateList(readlist)) return

  let perm = {
    owner: [uuid],
    writelist: validateList(writelist) ? writelist : [],
    readlist: validateList(readlist) ? readlist : [] 
  } 

  await updateXattrPermissionAsync(drivepath, perm)
}

// skip owner check for now TODO
async checkLibraryXstat(rootpath, uuid) {

  let libraryPath = path.join(rootpath, uuid)  
  let perm = { writelist: [], readlist: [] }

  // do this anyway
  await updateXattrPermissionAsync(libraryPath, perm)
}

async function inspectDrives(driveDir) {

  let files = await fsReaddirAsync(droot)
  files = files.filter(f => validator.isUUID(f))

  for (let i = 0; i < files.length; i++) {
    await checkDriveXstat(droot, files[i])
  } 
}

async function inspectLibraries(libraryDir) {

  let files = await fsReaddirAsync(lroot)
  files = files.filter(f => validator.isUUID(f))

  for (let i = 0; i < files.length; i++) {
    await checkLibraryXstat(lroot, files[i])
  }
}

const visit = (xstat, eol, done) => {

  fs.readdir(xstat.abspath, (err, list) => {
    if (err || list.length === 0) return done()

    let count = list.length 
    list.forEach(entry => {

      readXstats(path.join(xstat.abspath, entry), (err, entryXstat) => {
        if (!err && eol(entryXstat, xstat)) 
          return visit(entryXstat, enter, () => {
            if (!--count) done()
          })

        if (!--count) done() 
      })
    })
  })
}

const nodeEOL = (cxstat, pxstat) => {

  // only process file and folder
  if (cxstat.isFile() || cxstat.isDirectory()) {
    
    // enter only if node created and being directory
    if (tree.createNodeByUUID(pxstat.uuid, cxstat) && cxstat.isDirectory())
      return true
  }
  return false
}


const mapXstatToObject = (xstat) {

/* example xstat, xstat instanceof fs.stat
{ dev: 2049,
  mode: 16893,
  nlink: 2,
  uid: 1000,
  gid: 1000,
  rdev: 0,
  blksize: 4096,
  ino: 135577,
  size: 4096,
  blocks: 16,
  atime: 2016-06-27T06:36:58.382Z,
  mtime: 2016-06-27T06:36:58.382Z,
  ctime: 2016-06-27T06:36:58.382Z,
  birthtime: 2016-06-27T06:36:58.382Z,
  uuid: '0924c387-f1c6-4a35-a5db-ae4b7568d5de',
  owner: [ '061a954c-c52a-4aa2-8702-7bc84c72ec84' ],
  writelist: [ '9e7b40bf-f931-4292-8870-9e62b9d5a12c' ],
  readlist: [ 'b7ed9abc-01d3-41f0-80eb-361498025e56' ],
  hash: null,
  abspath: '/home/xenial/Projects/fruitmix/tmptest' } */

  // not very safe TODO
  let name = abspath.split('/').pop()
  
  let type
  if (xstat.isDirectory()) type = 'folder'
  else if (xstat.isFile()) type = 'file'
  else throw 'Only xstat with type of folder or file can be mapped'

  return {
    uuid: xstat.uuid,
    type: type,
    permission: {
      owner: xstat.owner[0],
      writelist: xstat.writelist,
      readlist: xstat.readlist,
    },
    attribute: {
      changetime = xstat.ctime,
      modifytime = xstat.mtime,
      createtime = xstat.birthtime,
      size: xstat.size,
      name: name,     
    },
    path: null, // TODO to be removed
    detail: null, // TODO to be removed 
  }
}



const buildMapTree = (rootDir) {

  let rootX = await readXstatsAsync(rootDir)
  let rootObj = mapXstatToObject(rootX)
  let maptree = new MapTree(rootObj)

  let libX = await readXstatsAsync(libraryDir(rootDir))
  let libObj = mapXstatToObject(libX)
  let libNode = maptree.createNode(tree.root, libObj)

  let driveX = await readXstatsAsync(driveDir(rootDir))
  let driveObj = mapXstatToObject(driveX)
  let driveDirNode = maptree.createNode(tree.root, driveObj)

  
}

let maptree = null
let driveDirNode
let libraryDirNode

// root should be something like '/data/fruitmix'
async function init(root) {

  await initMkdirs(root)
  await inspectDrives(driveDir(root))
  await inspectLibraries(libraryDir(root))

  let rootX = await readXstatsAsync('/data/fruitmix')
  maptree = new MapTree(rootObj) 
  let root = tree.root

  let libX = await readXstatsAsync('/data/fruitmix/library')
  let lib = tree.createNode(tree.root, libX)

  let driveX = await readXstatsAsync('/data/fruitmix/drive')
  let drive = tree.createNode(tree.root, driveX)

  visit(driveX, nodeEOL, () => {
    tree._visit_pre(drive, (node) => console.log(node.abspath))
  })

  visit(libX, nodeEOL, () => {
    console.log(lib.children.map(c => c.abspath))
  })
}
