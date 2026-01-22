import { VeltCommentsSidebar, VeltComments } from '@veltdev/react';
import VeltInitializeDocument from './VeltInitializeDocument';
import VeltInitializeUser from './VeltInitializeUser';

function VeltCollaboration() {
    return (
        <>
            <VeltInitializeDocument />
            <VeltInitializeUser />
            <VeltComments />
            <VeltCommentsSidebar pageMode={true} />
        </>
    )
}

export default VeltCollaboration;