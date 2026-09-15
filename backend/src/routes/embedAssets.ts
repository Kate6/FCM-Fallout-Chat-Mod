import express from 'express';
import { serveEmbedAsset } from '../controllers/embedAssetController';

const router = express.Router();
router.get('/:id/:filename', serveEmbedAsset);

export default router;
module.exports = router;
