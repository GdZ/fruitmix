import path from 'path'
import fs from 'fs'

import { readXstat2 } from './xstat'
import { mkdirpAsync, fsStatAsync, fsMkdirAsync, mapXstatToObject } from './tools'
import { createProtoMapTree } from './protoMapTree'

class Repo {

  constructor(rootpath) {

    this.rootpath = rootpath
    this.drives = []
    this.libraries = []
  }

  prepend() {
    return path.resolve(this.rootpath, '..')
  }

  driveDirPath() {
    return path.join(this.rootpath, 'drive')
  }

  libraryDirPath() {
    return path.join(this.rootpath, 'library')
  }

  findTreeInDriveByUUID(uuid) {
    return this.drives.find(tree => tree.uuidMap.get(uuid))
  }

  findTreeInLibraryByUUID(uuid) {
    return this.libraries.find(tree => tree.uuidMap.get(uuid))
  }

  findNodeInDriveByUUID(uuid) {
    for (let i = 0; i < drives.length; i++) {
      let x = drives[i].uuidMap.get(uuid)
      if (x) return x
    }
  }

  findNodeInLibraryByUUID(uuid) {
    for (let i = 0; i < libraries.length; i++) {
      let x = libraries[i].uuidMap.get(uuid)
      if (x) return x
    }
  }

  // operation name, args ..., return true / false
  permission(action) {
    
    switch(action.type) {
    case 'DRV_CREATE_FILE_IN_FOLDER':
      // requires user have at least write permission in folder, or, this is the drive he/she owns.
      // requires action.userUUID, action.folderUUID
       
    
      break
    default:
      return false
    }
  }

  scanDrives(callback) {
    fs.readdir(this.driveDirPath(), (err, entries) => {
      if (err) callback(err)
      if (entries.length === 0) return callback(null)      
      let count = entries.length
      entries.forEach(entry => {
        createProtoMapTree(path.join(this.driveDirPath(), entry), 'drive', (err, tree) => {
          if (!err) this.drives.push(tree)
          if (!--count) callback()
        })
      })      
    }) 
  } 

  scanLibraries(callback) {
    fs.readdir(this.libraryDirPath(), (err, entries) => {
      if (err) callback(err)
      if (entries.length === 0) return callback(null)
      let count = entries.length
      entries.forEach(entry => {
        createProtoMapTree(path.join(this.libraryDirPath(), entry), 'library', (err, tree) => {
          if (!err) this.libraries.push(tree)
          if (!--count) callback()
        })
      })
    })
  }

  scan(callback) {
    let count = 2
    this.scanDrives(() => !--count && callback())
    this.scanLibraries(() => !--count && callback())
  }

  createDrive(userUUID, callback) {
  
    let dirpath = path.join(this.driveDirPath(), userUUID)
    fs.mkdir(dirpath, err => {

      if (err) return callback(err)
      let perm = {
        owner: [userUUID],
        writelist: [],
        readlist: []
      }

      readXstat2(dirpath, perm, (err, xstat) => {
        if (err) return callback(err)

        createProtoMapTree(dirpath, 'drive', (err, tree) => {
          if (err) return callback(err)
          this.drives.push(tree)
          callback(null, tree)    
        }) 
      })
    })
  } 
   
  createLibrary(userUUID, libraryUUID, callback) {
    
    let dirpath = path.join(this.libraryDirPath(), libraryUUID)
    fs.mkdir(dirpath, err => {
      if (err) return callback(err)

      let perm = {
        owner: [userUUID],
        writelist: [],
        readlist: []
      }

      readXstat2(dirpath, perm, (err, xstat) => {
        if (err) return callback(err)

        createProtoMapTree(dirpath, 'library', (err, tree) => { 
          if (err) return callback(err)
          this.libraries.push(tree)
          callback(null, tree)
        })
      })
    })
  }

  createFileInDrive(userUUID, srcpath, targetDirUUID, filename, callback) {

    //let tree = findTreeInDriveByUUID(userUUID)
    //if (!tree) return callback    

    let node = findNodeInDriveByUUID(targetDirUUID)
    if (!node) return callback(new Error('uuid not found')) 

    node.tree.importFile(srcpath, node, filename, (err, node) => {
      err ? callback(err) : callback(null, node)
    })
  }

  createDriveFolder(userUUID, folderName, targetDirUUID) {
    let tree = findTreeInDriveByUUID(userUUID)
    if (!tree) return callback    

    let node = findNodeInDriveByUUID(targetDirUUID)
    if (!node) return callback(new Error('uuid not found')) 

    node.tree.createFolder(node,folderName,(err,node) => {
      err?callback(err) : callback(null,node)
    })
  }  

  createLibraryFile(userUUID, extpath, hash,targetLibraryUUID) {
    let tree = findTreeInDriveByUUID(userUUID)
    if (!tree) return callback    

    let node = findNodeInDriveByUUID(targetLibraryUUID)
    if (!node) return callback(new Error('uuid not found')) 

    node.tree.importFile(extpath, node, hash, (err, node) => {
      err ? callback(err) : callback(null, node)
    })
  } 

  /** read **/  

  /** update **/

  renameDriveFileOrFilder(uuid, newName) {

    let node = findNodeInDriveByUUID(uuid)
    if (!node) return callback(new Error('uuid not found'))

    node.tree.renameFileOrFolder(node,newName, (err,node)=>{
      err ? callback(err) : callback(null, node)
    })
    // TODO
  } 

  // overwrite
  updateDriveFile(targetDirUUID, xattr) {
    let node = findNodeInDriveByUUID(targetDirUUID)
    if (!node) return callback(new Error('uuid not found'))

    node.tree.updateDriveFile(node,xattr,(err,node)=>{
      err ? callback(err) : callback(null, node)
    })
  }

  /** delete **/
  deleteDriveFolder(folderUUID) {
    let node = findNodeInDriveByUUID(folderUUID)
    if (!node) return callback(new Error('uuid not found'))

    node.tree.deleteFileOrFolder(node,(err,node)=>{
      err ? callback(err) : callback(null, node)
    })
  }

  // deprecated
  printTree(keys) {

    let queue = []
    if (!this.tree) return console.log('no tree attached')

    this.tree.root.preVisit(node => {

      let obj = {
        parent: node.parent === null ? null : node.parent.uuid,
        parentName: node.parent === null ? null : node.parent.attribute.name,
        children: node.children.map(n => n.uuid),
        childrenName: node.children.map(n => n.attribute.name)
      }
       
      queue.push(obj)
    })
    console.log(queue)
  }
}

async function createRepoAsync(rootpath) {

  mkdirpAsync(path.join(rootpath, 'drive'))
  mkdirpAsync(path.join(rootpath, 'library'))
  return new Repo(rootpath)
}

function createRepo(rootpath, callback) {  

  createRepoAsync(rootpath)
    .then(repo => callback(null, repo))
    .catch(e => callback(e))
}

export { createRepo }

