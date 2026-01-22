import { VeltCommentsSidebar, VeltComments } from '@veltdev/react';
import VeltInitializeDocument from './VeltInitializeDocument';
import VeltInitializeUser from './VeltInitializeUser';

function VeltCollaboration() {
    return (
        <>
            <VeltInitializeDocument />
            <VeltInitializeUser />
            <VeltComments recordings='none' />
            <VeltCommentsSidebar readOnly={true} expandOnSelection={false} />
        </>
    )
}

export default VeltCollaboration;