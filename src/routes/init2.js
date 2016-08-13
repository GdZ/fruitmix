import { Router } from 'express'
import Models from '../models/models'
import { sysAvail } from '../lib/system'

const router = Router()

router.post('/', sysAvail, (req, res) => {

  let User = Models.getModel('user')

  // if user exists
  if (User.collection.list.length) return res.status(404).end()
  User.createUser(req.body) 
    .then(() => res.status(200).end())
    .catch(e => res.status(e.code === 'EINVAL' ? 400 : 500).json({
      code: e.code,
      message: e.message
    }))
})

export default router

